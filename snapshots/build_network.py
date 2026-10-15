"""Turn the GDRTA GTFS snapshot into the engine's transit network JSON.

Usage: python3 snapshots/build_network.py snapshots/GDRTA_GTFS@2026-10-03.zip

Writes snapshots/GDRTA_network@<date>.json with, per route: name, the stops it
serves on Mon-Thu, its drawn shapes (thinned), and peak / off-peak headways.

Headway, per route and direction: the median gap between consecutive trip
departures from their first stop, Mon-Thu service, within the window. The
route's headway is the mean of its directions. Fewer than 2 departures in a
window gives null (no regular service then).
"""
import csv, hashlib, io, json, math, statistics, sys, zipfile
from collections import defaultdict
from pathlib import Path

PEAK = (6 * 60, 9 * 60)
OFF_PEAK = (10 * 60, 14 * 60)
WEEKDAY_SERVICE = '1'
DROP_ROUTES = {'999'}
THIN_MI = 0.02

zip_path = Path(sys.argv[1])
raw = zip_path.read_bytes()
z = zipfile.ZipFile(io.BytesIO(raw))
rows = lambda name: csv.DictReader(io.TextIOWrapper(z.open(name), 'utf-8-sig'))

feed = next(rows('feed_info.txt'))
routes = {r['route_id']: r for r in rows('routes.txt') if r['route_id'] not in DROP_ROUTES}
trips = {t['trip_id']: t for t in rows('trips.txt') if t['service_id'] == WEEKDAY_SERVICE and t['route_id'] in routes}
stops = {s['stop_id']: (round(float(s['stop_lon']), 6), round(float(s['stop_lat']), 6)) for s in rows('stops.txt')}

def minutes(hhmmss):
    h, m, s = (int(x) for x in hhmmss.split(':'))
    return h * 60 + m + s / 60

first_departure = {}
route_stops = defaultdict(set)
for st in rows('stop_times.txt'):
    trip = trips.get(st['trip_id'])
    if not trip:
        continue
    route_stops[trip['route_id']].add(st['stop_id'])
    seq = int(st['stop_sequence'])
    if st['trip_id'] not in first_departure or seq < first_departure[st['trip_id']][0]:
        first_departure[st['trip_id']] = (seq, minutes(st['departure_time'] or st['arrival_time']))

def headway(route_id, window):
    per_direction = []
    for direction in ('0', '1'):
        times = sorted(t for tid, (_, t) in first_departure.items()
                       if trips[tid]['route_id'] == route_id and trips[tid]['direction_id'] == direction
                       and window[0] <= t < window[1])
        gaps = [b - a for a, b in zip(times, times[1:]) if b > a]
        if gaps:
            per_direction.append(statistics.median(gaps))
    return round(statistics.mean(per_direction), 1) if per_direction else None

def miles(a, b):
    dlat = math.radians(b[1] - a[1])
    dlon = math.radians(b[0] - a[0]) * math.cos(math.radians(a[1]))
    return 3958.8 * math.hypot(dlat, dlon)

shape_ids = defaultdict(set)
for t in trips.values():
    if t['shape_id']:
        shape_ids[t['route_id']].add(t['shape_id'])
wanted = set().union(*shape_ids.values())
shape_points = defaultdict(list)
for p in rows('shapes.txt'):
    if p['shape_id'] in wanted:
        shape_points[p['shape_id']].append((int(p['shape_pt_sequence']), (float(p['shape_pt_lon']), float(p['shape_pt_lat']))))

def thinned(points):
    pts = [pt for _, pt in sorted(points)]
    out = [pts[0]]
    for pt in pts[1:-1]:
        if miles(out[-1], pt) >= THIN_MI:
            out.append(pt)
    out.append(pts[-1])
    return [[round(x, 5), round(y, 5)] for x, y in out]

network_routes = []
for route_id, r in sorted(routes.items()):
    if not route_stops[route_id]:
        continue
    name = r['route_short_name'].lstrip('0') or r['route_short_name']
    name = 'Flyer' if name.upper() == 'FLYER' else name
    network_routes.append({
        'id': name,
        'name': f'Route {name}',
        'longName': r['route_long_name'].title(),
        'color': f"#{r['route_color']}" if r['route_color'] else None,
        'peakHeadwayMin': headway(route_id, PEAK),
        'offPeakHeadwayMin': headway(route_id, OFF_PEAK),
        'noService': [period for period, window in (('peak', PEAK), ('offPeak', OFF_PEAK)) if headway(route_id, window) is None],
        'stops': sorted(stops[s] for s in route_stops[route_id]),
        'parts': [thinned(shape_points[s]) for s in sorted(shape_ids[route_id]) if shape_points[s]],
    })

date = zip_path.stem.split('@')[1]
sha = hashlib.sha256(raw).hexdigest()
out = {
    'snapshotId': f'GDRTA_GTFS@{date}#{sha[:8]}',
    'source': {
        'file': zip_path.name, 'sha256': sha,
        'feedVersion': feed.get('feed_version'),
        'validFrom': feed.get('feed_start_date'), 'validTo': feed.get('feed_end_date'),
    },
    'headwayMethod': 'Mon-Thu service. Per direction, median gap between trip departures from their first stop; '
                     'route headway is the mean of its directions. Peak 6-9 am, off-peak 10 am-2 pm. '
                     'Fewer than 2 departures in a window means no regular service then (listed in noService).',
    'routes': network_routes,
}
dest = zip_path.with_name(f'GDRTA_network@{date}.json')
dest.write_text(json.dumps(out, separators=(',', ':')))
print(dest, dest.stat().st_size, 'bytes,', len(network_routes), 'routes')
for r in network_routes:
    print(f"  {r['name']:<12} peak {r['peakHeadwayMin']}  off-peak {r['offPeakHeadwayMin']}  stops {len(r['stops'])}  shapes {len(r['parts'])}")
