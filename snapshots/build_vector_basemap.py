"""Pin the vector basemap for Montgomery County, Ohio as one PMTiles file.

Usage: python3 snapshots/build_vector_basemap.py [path/to/pmtiles]

Cuts two pieces out of a dated Protomaps planet build with the go-pmtiles
command line tool (https://github.com/protomaps/go-pmtiles/releases, 1.31.2
or later; pass its path when it is not on PATH) and joins them with the
Python pmtiles package (pip install pmtiles):

- the neighbourhood: the county's extent widened by half its size on every
  side, zooms 0 to 10, so the county-wide view shows the towns around it;
- the county: its extent plus 0.01 degrees, zooms 11 to 14. MapLibre
  overzooms zoom 14 for closer views.

Writes snapshots/montgomery-vector@<build date>.pmtiles and a JSON record
beside it with the source URL, boxes, zooms, tool version and sha256. The app
reads the .pmtiles file directly; nothing is fetched from Protomaps or
OpenStreetMap at run time.
"""
import hashlib, json, shutil, subprocess, sys, tempfile
from pathlib import Path
from pmtiles.reader import Reader, MmapSource, all_tiles
from pmtiles.tile import zxy_to_tileid
from pmtiles.writer import Writer

BUILD_DATE = '20261006'
SOURCE_URL = f'https://build.protomaps.com/{BUILD_DATE}.pmtiles'
COUNTY_EXTENT = (-84.4857, 39.5782, -84.0510, 39.9230)
COUNTY_MARGIN_DEGREES = 0.01
NEIGHBOURHOOD_SHARE = 0.5
NEIGHBOURHOOD_MAX_ZOOM = 10
MAX_ZOOM = 14

tool = sys.argv[1] if len(sys.argv) > 1 else shutil.which('pmtiles')
if not tool:
    sys.exit('pmtiles command line tool not found; pass its path')
west, south, east, north = COUNTY_EXTENT
county_box = (west - COUNTY_MARGIN_DEGREES, south - COUNTY_MARGIN_DEGREES, east + COUNTY_MARGIN_DEGREES, north + COUNTY_MARGIN_DEGREES)
wide, high = (east - west) * NEIGHBOURHOOD_SHARE, (north - south) * NEIGHBOURHOOD_SHARE
neighbourhood_box = (west - wide, south - high, east + wide, north + high)


def box_text(box):
    return ','.join(f'{value:.4f}' for value in box)


def extract(box, max_zoom, out):
    subprocess.run([tool, 'extract', SOURCE_URL, str(out), f'--bbox={box_text(box)}', f'--maxzoom={max_zoom}'], check=True)
    handle = open(out, 'rb')
    return Reader(MmapSource(handle))


iso_date = f'{BUILD_DATE[:4]}-{BUILD_DATE[4:6]}-{BUILD_DATE[6:]}'
out = Path(__file__).parent / f'montgomery-vector@{iso_date}.pmtiles'
version = subprocess.run([tool, 'version'], capture_output=True, text=True, check=True).stdout.strip()
with tempfile.TemporaryDirectory() as scratch:
    neighbourhood = extract(neighbourhood_box, NEIGHBOURHOOD_MAX_ZOOM, Path(scratch) / 'neighbourhood.pmtiles')
    county = extract(county_box, MAX_ZOOM, Path(scratch) / 'county.pmtiles')
    tiles = {zxy_to_tileid(*zxy): data for zxy, data in all_tiles(neighbourhood.get_bytes)}
    tiles.update({zxy_to_tileid(*zxy): data for zxy, data in all_tiles(county.get_bytes) if zxy[0] > NEIGHBOURHOOD_MAX_ZOOM})
    header = county.header()
    metadata = county.metadata()
    with open(out, 'wb') as handle:
        writer = Writer(handle)
        for tile_id in sorted(tiles):
            writer.write_tile(tile_id, tiles[tile_id])
        to_e7 = lambda value: int(value * 10_000_000)
        header.update({
            'min_lon_e7': to_e7(neighbourhood_box[0]), 'min_lat_e7': to_e7(neighbourhood_box[1]),
            'max_lon_e7': to_e7(neighbourhood_box[2]), 'max_lat_e7': to_e7(neighbourhood_box[3]),
            'center_zoom': NEIGHBOURHOOD_MAX_ZOOM, 'center_lon_e7': to_e7((west + east) / 2), 'center_lat_e7': to_e7((south + north) / 2),
        })
        writer.finalize(header, metadata)

body = out.read_bytes()
record = {
    'snapshotId': f"Protomaps_basemap@{iso_date}#{hashlib.sha256(body).hexdigest()[:8]}",
    'description': 'Protomaps vector basemap (OpenStreetMap and Natural Earth) for the app map: the county and its neighbourhood up to zoom 10, the county alone at zooms 11 to 14',
    'source': {'url': SOURCE_URL, 'osmReplicationTime': metadata.get('planetiler:osm:osmosisreplicationtime'), 'basemapVersion': metadata.get('version')},
    'attribution': '© OpenStreetMap contributors, Protomaps',
    'pieces': [
        {'bbox': [round(value, 4) for value in neighbourhood_box], 'zooms': [0, NEIGHBOURHOOD_MAX_ZOOM]},
        {'bbox': [round(value, 4) for value in county_box], 'zooms': [NEIGHBOURHOOD_MAX_ZOOM + 1, MAX_ZOOM]},
    ],
    'tiles': len(tiles),
    'tool': version,
    'file': out.name,
    'bytes': len(body),
    'sha256': hashlib.sha256(body).hexdigest(),
}
out.with_suffix('.json').write_text(json.dumps(record, indent=2, ensure_ascii=False) + '\n')
print(f'wrote {out.name}: {len(body)} bytes, {len(tiles)} tiles')
