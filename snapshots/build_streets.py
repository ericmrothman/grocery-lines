"""Pin a routable street network for Montgomery County, Ohio, from OpenStreetMap.

Usage: python3 snapshots/build_streets.py [raw-overpass.json]
       python3 snapshots/build_streets.py --save-response raw-overpass.json

Without an argument it asks the Overpass API for every road and path in the
county plus about two miles around it as OpenStreetMap stood at OSM_DATE (a
dated query, so a rerun returns the same ways), and records the query and the
response's sha256. With an argument it rebuilds from a saved response instead,
so the graph can be checked byte for byte. Parking aisles are walkable but not
drivable; crossings, traffic islands and access aisles are walkable like any
footway. Mapped sidewalks (footway=sidewalk) are left out: the street beside them
is already walkable and stands in for them (DEF-005b, rechecked in DEF-053).
Freeways, trunk roads and their ramps are never walkable.

Writes snapshots/streets@<OSM date>.json: graph nodes are street ends and
junctions; each edge is the run of a way between two of them, with its road
class, who may use it in which direction, its length and its drawn shape.
Street names (the way's name tag, else its ref) sit in a separate table with
their own sha256, outside the hashed graph, so naming streets never changes
the snapshotId that the travel surface and findings were built against.
Map data (c) OpenStreetMap contributors, ODbL 1.0. The derived file is
offered under the same licence.
"""
import datetime, hashlib, json, math, sys, urllib.parse, urllib.request
from collections import Counter, defaultdict
from pathlib import Path

OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
SOUTH, WEST, NORTH, EAST = 39.549, -84.523, 39.952, -84.0135
ROAD_CLASSES = [
    'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential',
    'living_street', 'service', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link',
    'tertiary_link', 'pedestrian', 'footway', 'path', 'steps', 'track', 'cycleway',
]
OSM_DATE = '2026-10-03T19:51:06Z'
QUERY = (
    f'[out:json][timeout:240][date:"{OSM_DATE}"];way["highway"~"^({"|".join(ROAD_CLASSES)})$"]'
    f'({SOUTH},{WEST},{NORTH},{EAST});out body;>;out skel qt;'
)
DRIVABLE = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential',
            'living_street', 'service', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'}
NOT_WALKABLE = {'motorway', 'trunk', 'motorway_link', 'trunk_link'}
SKIPPED_SERVICE = {'driveway', 'drive-through', 'emergency_access'}
WALK_ONLY_SERVICE = {'parking_aisle'}
SKIPPED_FOOTWAY = {'sidewalk'}
SHAPE_TOLERANCE_M = 3.0
IMPLIED_ONE_WAY = {'motorway', 'motorway_link'}
NO_ACCESS = {'no', 'private'}
EARTH_RADIUS_M = 6371008.8
COORDINATE_SCALE = 100000

CAR_FORWARD, CAR_BACKWARD, WALK = 1, 2, 4


def fetch():
    request = urllib.request.Request(
        OVERPASS_URL,
        data=urllib.parse.urlencode({'data': QUERY}).encode(),
        headers={'User-Agent': 'dayton-food-map-snapshot/0.1 (Montgomery County food access study)'},
    )
    with urllib.request.urlopen(request, timeout=320) as response:
        return response.read()


def metres_between(start, end):
    (start_lon, start_lat), (end_lon, end_lat) = start, end
    latitude_change = math.radians(end_lat - start_lat)
    longitude_change = math.radians(end_lon - start_lon)
    haversine = (math.sin(latitude_change / 2) ** 2
                 + math.cos(math.radians(start_lat)) * math.cos(math.radians(end_lat)) * math.sin(longitude_change / 2) ** 2)
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(haversine))


def access_flags(tags):
    road_class = tags['highway']
    if road_class == 'service' and tags.get('service') in SKIPPED_SERVICE:
        return 0
    if road_class == 'footway' and tags.get('footway') in SKIPPED_FOOTWAY:
        return 0
    flags = 0
    car_allowed = road_class in DRIVABLE and tags.get('service') not in WALK_ONLY_SERVICE and tags.get('access') not in NO_ACCESS and tags.get('motor_vehicle') not in NO_ACCESS
    if car_allowed:
        one_way = tags.get('oneway')
        if one_way == '-1':
            flags |= CAR_BACKWARD
        elif one_way in ('yes', 'true', '1') or road_class in IMPLIED_ONE_WAY or tags.get('junction') == 'roundabout':
            flags |= CAR_FORWARD
        else:
            flags |= CAR_FORWARD | CAR_BACKWARD
    walk_allowed = road_class not in NOT_WALKABLE and tags.get('foot') not in NO_ACCESS and tags.get('access') not in ('no',)
    if walk_allowed:
        flags |= WALK
    return flags


def offset_from_line_m(point, line_start, line_end):
    reference_lat = math.radians(line_start[1])
    def to_metres(position):
        return ((position[0] - line_start[0]) * math.cos(reference_lat) * math.pi / 180 * EARTH_RADIUS_M,
                (position[1] - line_start[1]) * math.pi / 180 * EARTH_RADIUS_M)
    point_x, point_y = to_metres(point)
    end_x, end_y = to_metres(line_end)
    length_squared = end_x * end_x + end_y * end_y
    if length_squared == 0:
        return math.hypot(point_x, point_y)
    fraction = max(0, min(1, (point_x * end_x + point_y * end_y) / length_squared))
    return math.hypot(point_x - fraction * end_x, point_y - fraction * end_y)


def simplified_shape(run, points):
    keep = [False] * len(run)
    keep[0] = keep[-1] = True
    pending = [(0, len(run) - 1)]
    while pending:
        first, last = pending.pop()
        farthest, farthest_offset = None, SHAPE_TOLERANCE_M
        for middle in range(first + 1, last):
            offset = offset_from_line_m(points[run[middle]], points[run[first]], points[run[last]])
            if offset > farthest_offset:
                farthest, farthest_offset = middle, offset
        if farthest is not None:
            keep[farthest] = True
            pending.extend([(first, farthest), (farthest, last)])
    return [node for node, kept in zip(run, keep) if kept][1:-1]


def street_label(tags):
    name = tags.get('name', '').strip()
    if name:
        return name
    ref = tags.get('ref', '').strip()
    return ' / '.join(part.strip() for part in ref.split(';') if part.strip()) or None


def scaled(value):
    return int(round(value * COORDINATE_SCALE))


def build(raw):
    data = json.loads(raw)
    points = {element['id']: (element['lon'], element['lat']) for element in data['elements'] if element['type'] == 'node'}
    ways = []
    for element in data['elements']:
        if element['type'] != 'way':
            continue
        flags = access_flags(element['tags'])
        if flags:
            ways.append((element['tags']['highway'], flags, element['nodes'], street_label(element['tags'])))
    uses = Counter(node for _, _, way_nodes, _ in ways for node in way_nodes)
    junctions = {node for node, count in uses.items() if count > 1}
    for _, _, way_nodes, _ in ways:
        junctions.add(way_nodes[0])
        junctions.add(way_nodes[-1])

    node_index = {}
    node_order = []

    def index_of(node):
        if node not in node_index:
            node_index[node] = len(node_order)
            node_order.append(node)
        return node_index[node]

    edges = []
    edge_labels = []
    for road_class, flags, way_nodes, label in ways:
        run = [way_nodes[0]]
        for node in way_nodes[1:]:
            run.append(node)
            if node in junctions:
                length = sum(metres_between(points[first], points[second]) for first, second in zip(run, run[1:]))
                if length > 0:
                    edges.append((index_of(run[0]), index_of(run[-1]), ROAD_CLASSES.index(road_class), flags, length, simplified_shape(run, points)))
                    edge_labels.append(label)
                run = [node]

    longitudes, latitudes = [], []
    previous_lon = previous_lat = 0
    for node in node_order:
        lon, lat = (scaled(value) for value in points[node])
        longitudes.append(lon - previous_lon)
        latitudes.append(lat - previous_lat)
        previous_lon, previous_lat = lon, lat

    shape_point_counts, shape = [], []
    for start, _, _, _, _, inner in edges:
        previous_lon, previous_lat = (scaled(value) for value in points[node_order[start]])
        for node in inner:
            lon, lat = (scaled(value) for value in points[node])
            shape.extend([lon - previous_lon, lat - previous_lat])
            previous_lon, previous_lat = lon, lat
        shape_point_counts.append(len(inner))

    from_deltas = []
    previous_from = 0
    for edge in edges:
        from_deltas.append(edge[0] - previous_from)
        previous_from = edge[0]

    name_table = []
    name_index = {}
    name_steps = []
    previous_name = 0
    for label in edge_labels:
        if not label:
            name_steps.append(None)
            continue
        if label not in name_index:
            name_index[label] = len(name_table)
            name_table.append(label)
        name_steps.append(name_index[label] - previous_name)
        previous_name = name_index[label]

    return {
        'names': {'table': name_table, 'edgeNameSteps': name_steps},
        'nodes': {'coordinateScale': COORDINATE_SCALE, 'longitudeDeltas': longitudes, 'latitudeDeltas': latitudes},
        'edges': {
            'fromDeltas': from_deltas,
            'toMinusFrom': [edge[1] - edge[0] for edge in edges],
            'roadClass': [edge[2] for edge in edges],
            'access': [edge[3] for edge in edges],
            'lengthDecimetres': [int(round(edge[4] * 10)) for edge in edges],
            'shapePointCounts': shape_point_counts,
            'shapeDeltas': shape,
        },
    }


def main():
    if len(sys.argv) > 2 and sys.argv[1] == '--save-response':
        raw = fetch()
        fetched_at = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
        Path(sys.argv[2]).write_bytes(raw)
    elif len(sys.argv) > 1:
        raw = Path(sys.argv[1]).read_bytes()
        fetched_at = datetime.datetime.fromtimestamp(Path(sys.argv[1]).stat().st_mtime, datetime.timezone.utc).isoformat(timespec='seconds')
    else:
        raw = fetch()
        fetched_at = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
    graph = build(raw)
    content = json.dumps({'nodes': graph['nodes'], 'edges': graph['edges']}, separators=(',', ':')).encode()
    fetch_date = OSM_DATE[:10]
    snapshot = {
        'snapshotId': f'OSM_streets@{fetch_date}#{hashlib.sha256(content).hexdigest()[:8]}',
        'attribution': 'Map data (c) OpenStreetMap contributors, ODbL 1.0, https://www.openstreetmap.org/copyright. This derived network is offered under the ODbL.',
        'source': {
            'url': OVERPASS_URL, 'query': QUERY, 'fetchedAt': fetched_at, 'osmDate': OSM_DATE,
            'responseSha256': hashlib.sha256(raw).hexdigest(), 'responseBytes': len(raw),
        },
        'roadClasses': ROAD_CLASSES,
        'accessFlags': {'carForward': CAR_FORWARD, 'carBackward': CAR_BACKWARD, 'walk': WALK},
        'nodes': graph['nodes'],
        'edges': graph['edges'],
        'streetNames': {
            'sha256': hashlib.sha256(json.dumps(graph['names'], separators=(',', ':')).encode()).hexdigest(),
            'encoding': 'table in order of first use; edgeNameSteps[i] is edge i\'s table index minus the previous named edge\'s, null where the way has neither name nor ref',
            **graph['names'],
        },
    }
    out = Path(__file__).parent / f'streets@{fetch_date}.json'
    out.write_text(json.dumps(snapshot, separators=(',', ':')) + '\n')
    print(f'wrote {out.name}: {len(graph["nodes"]["longitudeDeltas"])} nodes, {len(graph["edges"]["fromDeltas"])} edges, {len(graph["names"]["table"])} street names, {out.stat().st_size} bytes')


if __name__ == '__main__':
    main()
