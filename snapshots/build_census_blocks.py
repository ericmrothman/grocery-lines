"""Pin Census 2020 block housing counts for Montgomery County, Ohio.

Usage: python3 snapshots/build_census_blocks.py [tl_2020_39_tabblock20.zip]

Downloads (or reads) the 2020 TIGER/Line block file for Ohio and keeps every
block in county 39113 with at least one housing unit. Each block is written
with its block group, its 2020 housing units (HOUSING20) and the points where
those homes are counted: the points of a fixed 0.1-mile lattice that fall
inside the block, or the block's internal point when none does. The homes are
shared equally among a block's points, so a large rural block spreads thin
instead of landing in one hexagon. The output, snapshots/census-blocks@<date>.json,
carries the source URL, sha256 and fetch time. Only the travel surface
builder reads it; the app never loads it.
"""
import datetime, hashlib, io, json, math, struct, sys, urllib.request, zipfile
from pathlib import Path

STATE, COUNTY = '39', '113'
BLOCKS_URL = 'https://www2.census.gov/geo/tiger/TIGER2020/TABBLOCK20/tl_2020_39_tabblock20.zip'
BASE_NAME = 'tl_2020_39_tabblock20'
LATTICE_MI = 0.1
MILES_PER_LATITUDE_DEGREE = 69.05
REFERENCE_LATITUDE = 39.75
COORDINATE_DIGITS = 5


def download(url):
    with urllib.request.urlopen(url, timeout=600) as response:
        return response.read()


def dbf_rows(data):
    record_count, header_length, record_length = struct.unpack('<IHH', data[4:12])
    fields, offset = [], 32
    while data[offset] != 0x0D:
        descriptor = data[offset:offset + 32]
        fields.append((descriptor[:11].split(b'\0')[0].decode(), descriptor[16]))
        offset += 32
    for index in range(record_count):
        start = header_length + index * record_length
        record, position, row = data[start:start + record_length], 1, {}
        for name, length in fields:
            row[name] = record[position:position + length].decode('latin-1').strip()
            position += length
        yield row


def shp_polygons(data):
    offset = 100
    while offset < len(data):
        content_length = struct.unpack('>i', data[offset + 4:offset + 8])[0] * 2
        record = data[offset + 8:offset + 8 + content_length]
        offset += 8 + content_length
        shape_type = struct.unpack('<i', record[:4])[0]
        if shape_type == 0:
            yield []
            continue
        part_count, point_count = struct.unpack('<ii', record[36:44])
        parts = list(struct.unpack(f'<{part_count}i', record[44:44 + 4 * part_count]))
        points_start = 44 + 4 * part_count
        coordinates = struct.unpack(f'<{2 * point_count}d', record[points_start:points_start + 16 * point_count])
        points = list(zip(coordinates[0::2], coordinates[1::2]))
        yield [points[start:end] for start, end in zip(parts, parts[1:] + [point_count])]


def inside(lon, lat, rings):
    crossings = 0
    for ring in rings:
        for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
            if (y1 > lat) != (y2 > lat) and lon < x1 + (lat - y1) / (y2 - y1) * (x2 - x1):
                crossings += 1
    return crossings % 2 == 1


def lattice_points(rings):
    step_lat = LATTICE_MI / MILES_PER_LATITUDE_DEGREE
    step_lon = LATTICE_MI / (MILES_PER_LATITUDE_DEGREE * math.cos(math.radians(REFERENCE_LATITUDE)))
    longitudes = [lon for ring in rings for lon, _ in ring]
    latitudes = [lat for ring in rings for _, lat in ring]
    points = []
    for row in range(math.ceil(min(latitudes) / step_lat), math.floor(max(latitudes) / step_lat) + 1):
        for column in range(math.ceil(min(longitudes) / step_lon), math.floor(max(longitudes) / step_lon) + 1):
            lat, lon = row * step_lat, column * step_lon
            if inside(lon, lat, rings):
                points.append([round(lat, COORDINATE_DIGITS), round(lon, COORDINATE_DIGITS)])
    return points


if len(sys.argv) > 1:
    body = Path(sys.argv[1]).read_bytes()
    fetched_at = datetime.datetime.fromtimestamp(Path(sys.argv[1]).stat().st_mtime, datetime.timezone.utc).isoformat(timespec='seconds')
else:
    body = download(BLOCKS_URL)
    fetched_at = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
source = {'url': BLOCKS_URL, 'sha256': hashlib.sha256(body).hexdigest(), 'bytes': len(body), 'fetched_at': fetched_at}

archive = zipfile.ZipFile(io.BytesIO(body))
rows = dbf_rows(archive.read(f'{BASE_NAME}.dbf'))
polygons = shp_polygons(archive.read(f'{BASE_NAME}.shp'))

blocks = []
blocks_in_county = 0
for row, rings in zip(rows, polygons):
    if row['STATEFP20'] != STATE or row['COUNTYFP20'] != COUNTY:
        continue
    blocks_in_county += 1
    housing_units = int(row['HOUSING20'])
    if housing_units == 0:
        continue
    points = lattice_points(rings) or [[float(row['INTPTLAT20']), float(row['INTPTLON20'])]]
    blocks.append([row['GEOID20'][:12], housing_units, points])
blocks.sort(key=lambda block: (block[0], block[2][0]))

fetch_date = fetched_at[:10]
content = json.dumps(blocks, separators=(',', ':')).encode()
snapshot = {
    'snapshotId': f"Census_blocks_2020@{fetch_date}#{hashlib.sha256(content).hexdigest()[:8]}",
    'description': 'Census 2020 blocks in Montgomery County, Ohio (county 39113) with at least one housing unit: block group GEOID, housing units (HOUSING20), and the 0.1-mile lattice points inside the block (or its internal point) that share those homes equally',
    'source': source,
    'latticeMi': LATTICE_MI,
    'blocksInCounty': blocks_in_county,
    'housingUnits': sum(block[1] for block in blocks),
    'fields': ['blockGroup', 'housingUnits', 'points'],
    'blocks': blocks,
}
out = Path(__file__).parent / f'census-blocks@{fetch_date}.json'
out.write_text(json.dumps(snapshot, separators=(',', ':')) + '\n')
point_count = sum(len(block[2]) for block in blocks)
print(f'wrote {out.name}: {len(blocks)} blocks with homes of {blocks_in_county}, {snapshot["housingUnits"]} housing units, {point_count} points, {out.stat().st_size} bytes')
