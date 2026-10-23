"""Turn the pinned GDRTA GTFS feed into the engine's bus timetable.

Usage: python3 snapshots/build_transit.py snapshots/GDRTA_GTFS@2026-10-03.zip

Writes snapshots/GDRTA_timetable@<date>.json. Mon-Thu service only.

A pattern is one route, direction and ordered list of stops. For each pattern
and each period (peak 6-9 am, off-peak 10 am-2 pm) it holds the scheduled
minutes from its first stop to every later stop: the median over the
pattern's trips that leave their first stop in the window. Patterns with no
trip in a window have no times for that period. The headway is the median gap
between departures from the first stop of all of the route's trips in that
direction within the window (fewer than 2 departures: no regular service).
Each pattern keeps its GTFS shape, thinned, and where each stop falls on it,
so a ride can be drawn along the route between the two stops. Each pattern
also keeps every Mon-Thu trip's scheduled departure from each of its stops
(minutes after midnight), ordered by departure from the first stop, so trips
can be routed on the real timetable.
"""
import csv, hashlib, io, json, math, statistics, sys, zipfile
from collections import defaultdict
from pathlib import Path

PERIODS = {'peak': (6 * 60, 9 * 60), 'offPeak': (10 * 60, 14 * 60)}
WEEKDAY_SERVICE = '1'
DROP_ROUTES = {'999'}
SIMPLIFY_TOLERANCE_MI = 0.003
EARTH_RADIUS_MI = 3958.8


def minutes(hhmmss):
    hours, mins, seconds = (int(part) for part in hhmmss.split(':'))
    return hours * 60 + mins + seconds / 60


def miles_between(start, end):
    (start_lon, start_lat), (end_lon, end_lat) = start, end
    latitude_change = math.radians(end_lat - start_lat)
    longitude_change = math.radians(end_lon - start_lon)
    haversine = (math.sin(latitude_change / 2) ** 2
                 + math.cos(math.radians(start_lat)) * math.cos(math.radians(end_lat)) * math.sin(longitude_change / 2) ** 2)
    return 2 * EARTH_RADIUS_MI * math.asin(math.sqrt(haversine))


def title_case(name):
    words = []
    for word in name.strip().split(' '):
        if word in ('@', '&', '-') or '.' in word:
            words.append(word)
        elif any(character.isdigit() for character in word):
            words.append(word.lower())
        else:
            words.append(word[:1] + word[1:].lower())
    return ' '.join(words)


def offset_from_line_mi(point, line_start, line_end):
    scale = math.cos(math.radians(line_start[1]))
    def to_miles(position):
        return ((position[0] - line_start[0]) * scale * 69.09, (position[1] - line_start[1]) * 69.09)
    point_x, point_y = to_miles(point)
    end_x, end_y = to_miles(line_end)
    length_squared = end_x * end_x + end_y * end_y
    if length_squared == 0:
        return math.hypot(point_x, point_y)
    fraction = max(0, min(1, (point_x * end_x + point_y * end_y) / length_squared))
    return math.hypot(point_x - fraction * end_x, point_y - fraction * end_y)


def simplified(points, keep_indices):
    keep = [False] * len(points)
    for index in keep_indices:
        keep[index] = True
    keep[0] = keep[-1] = True
    anchors = sorted(index for index, kept in enumerate(keep) if kept)
    pending = list(zip(anchors, anchors[1:]))
    while pending:
        first, last = pending.pop()
        farthest, farthest_offset = None, SIMPLIFY_TOLERANCE_MI
        for middle in range(first + 1, last):
            offset = offset_from_line_mi(points[middle][1:3], points[first][1:3], points[last][1:3])
            if offset > farthest_offset:
                farthest, farthest_offset = middle, offset
        if farthest is not None:
            keep[farthest] = True
            pending.extend([(first, farthest), (farthest, last)])
    return keep


def main():
    zip_path = Path(sys.argv[1])
    raw = zip_path.read_bytes()
    feed = zipfile.ZipFile(io.BytesIO(raw))

    def rows(name):
        return csv.DictReader(io.TextIOWrapper(feed.open(name), 'utf-8-sig'))

    feed_info = next(rows('feed_info.txt'))
    routes = {route['route_id']: route for route in rows('routes.txt') if route['route_id'] not in DROP_ROUTES}
    trips = {trip['trip_id']: trip for trip in rows('trips.txt') if trip['service_id'] == WEEKDAY_SERVICE and trip['route_id'] in routes}
    stops = {stop['stop_id']: stop for stop in rows('stops.txt')}

    stop_times = defaultdict(list)
    for stop_time in rows('stop_times.txt'):
        if stop_time['trip_id'] in trips:
            stop_times[stop_time['trip_id']].append((int(stop_time['stop_sequence']), stop_time['stop_id'], minutes(stop_time['departure_time']), float(stop_time['shape_dist_traveled'] or 0)))

    shape_points = defaultdict(list)
    wanted_shapes = {trip['shape_id'] for trip in trips.values()}
    for point in rows('shapes.txt'):
        if point['shape_id'] in wanted_shapes:
            shape_points[point['shape_id']].append((int(point['shape_pt_sequence']), float(point['shape_pt_lon']), float(point['shape_pt_lat']), float(point['shape_dist_traveled'] or 0)))

    trips_by_pattern = defaultdict(list)
    departures_by_route_direction = defaultdict(list)
    for trip_id, visits in stop_times.items():
        visits.sort()
        trip = trips[trip_id]
        key = (trip['route_id'], trip['direction_id'], trip['shape_id'], tuple(stop_id for _, stop_id, _, _ in visits))
        trips_by_pattern[key].append(visits)
        departures_by_route_direction[(trip['route_id'], trip['direction_id'])].append(visits[0][2])

    def headway(route_id, direction_id, window):
        departures = sorted(time for time in departures_by_route_direction[(route_id, direction_id)] if window[0] <= time < window[1])
        if len(departures) < 2:
            return None
        return statistics.median(later - earlier for earlier, later in zip(departures, departures[1:]))

    stop_order = []
    stop_index = {}

    def index_of(stop_id):
        if stop_id not in stop_index:
            stop_index[stop_id] = len(stop_order)
            stop_order.append(stop_id)
        return stop_index[stop_id]

    patterns = []
    fastest_straight_line_mph = 0
    for (route_id, direction_id, shape_id, stop_ids), pattern_trips in sorted(trips_by_pattern.items()):
        minutes_by_period = {}
        for period, window in PERIODS.items():
            in_window = [visits for visits in pattern_trips if window[0] <= visits[0][2] < window[1]]
            if not in_window:
                minutes_by_period[period] = None
                continue
            minutes_by_period[period] = [round(statistics.median(visits[position][2] - visits[0][2] for visits in in_window), 3) for position in range(len(stop_ids))]
            for first in range(len(stop_ids)):
                for later in range(first + 1, len(stop_ids)):
                    scheduled = minutes_by_period[period][later] - minutes_by_period[period][first]
                    if scheduled <= 0:
                        continue
                    straight = miles_between((float(stops[stop_ids[first]]['stop_lon']), float(stops[stop_ids[first]]['stop_lat'])),
                                             (float(stops[stop_ids[later]]['stop_lon']), float(stops[stop_ids[later]]['stop_lat'])))
                    fastest_straight_line_mph = max(fastest_straight_line_mph, straight / scheduled * 60)
        points = sorted(shape_points[shape_id])
        stop_distances = [visit[3] for visit in pattern_trips[0]]
        nearest_point_at_stop = []
        cursor = 0
        for distance in stop_distances:
            while cursor + 1 < len(points) and points[cursor + 1][3] <= distance:
                cursor += 1
            nearest_point_at_stop.append(cursor)
        keep = simplified(points, nearest_point_at_stop)
        kept_position = {}
        thinned = []
        for index, point in enumerate(points):
            if keep[index]:
                kept_position[index] = len(thinned)
                thinned.append(point)
        shape_index_at_stop = [kept_position[index] for index in nearest_point_at_stop]
        route = routes[route_id]
        patterns.append({
            'routeId': route_id,
            'routeName': f"Route {title_case(route['route_short_name'].lstrip('0') or route['route_short_name']).upper() if route['route_short_name'][:1].isdigit() or route['route_short_name'][:1] == 'X' else title_case(route['route_short_name'])}",
            'routeLongName': route['route_long_name'],
            'direction': int(direction_id),
            'stops': [index_of(stop_id) for stop_id in stop_ids],
            'minutesFromFirstStop': minutes_by_period,
            'headwayMin': {period: headway(route_id, direction_id, window) for period, window in PERIODS.items()},
            'shape': [[round(lon, 5), round(lat, 5)] for _, lon, lat, _ in thinned],
            'shapeIndexAtStop': shape_index_at_stop,
            'trips': len(pattern_trips),
            'tripTimes': sorted([round(visit[2], 3) for visit in visits] for visits in pattern_trips),
        })

    stop_list = [{'id': stop_id, 'name': title_case(stops[stop_id]['stop_name']), 'lat': float(stops[stop_id]['stop_lat']), 'lon': float(stops[stop_id]['stop_lon'])} for stop_id in stop_order]
    content = json.dumps({'stops': stop_list, 'patterns': patterns}, separators=(',', ':'), sort_keys=True).encode()
    snapshot = {
        'snapshotId': f"GDRTA_timetable@{zip_path.stem.split('@')[1]}#{hashlib.sha256(content).hexdigest()[:8]}",
        'source': {'file': zip_path.name, 'sha256': hashlib.sha256(raw).hexdigest(), 'feedVersion': feed_info.get('feed_version'),
                   'validFrom': feed_info.get('feed_start_date'), 'validTo': feed_info.get('feed_end_date')},
        'method': 'Mon-Thu service. Ride minutes: per pattern and period, the median scheduled time from the first stop over trips leaving it in the window. Headway: median gap between departures of the route in that direction from their first stop within the window; fewer than 2 departures means no regular service then. Peak 6-9 am, off-peak 10 am-2 pm.',
        'fastestStraightLineMph': round(fastest_straight_line_mph + 0.5, 1),
        'stops': stop_list,
        'patterns': patterns,
    }
    out = zip_path.parent / f"GDRTA_timetable@{zip_path.stem.split('@')[1]}.json"
    out.write_text(json.dumps(snapshot, separators=(',', ':')) + '\n')
    print(f'wrote {out.name}: {len(stop_list)} stops, {len(patterns)} patterns, {out.stat().st_size} bytes, fastest straight-line {snapshot["fastestStraightLineMph"]} mph')


if __name__ == '__main__':
    main()
