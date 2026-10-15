"""Pin Census ZCTA centroids for the zip codes that touch Montgomery County, Ohio.

Usage: python3 snapshots/build_zip_centroids.py

Downloads the 2020 Census Gazetteer ZCTA file (internal points) and the 2020
ZCTA-to-county relationship file, keeps every ZCTA with land or water in
county 39113, and writes snapshots/zip-centroids@<date>.json with the source
URLs, their sha256 and fetch time, so a zip resolves with no network.
"""
import csv, datetime, hashlib, io, json, sys, urllib.request, zipfile
from pathlib import Path

COUNTY = '39113'
GAZETTEER_URL = 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2020_Gazetteer/2020_Gaz_zcta_national.zip'
RELATIONSHIP_URL = 'https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt'
SQUARE_METRES_PER_SQUARE_MILE = 1609.344 * 1609.344


def download(url):
    with urllib.request.urlopen(url, timeout=120) as response:
        body = response.read()
    fetched_at = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
    return body, {'url': url, 'sha256': hashlib.sha256(body).hexdigest(), 'bytes': len(body), 'fetched_at': fetched_at}


relationship_body, relationship_source = download(RELATIONSHIP_URL)
gazetteer_body, gazetteer_source = download(GAZETTEER_URL)

parts_in_county = {}
for row in csv.DictReader(io.StringIO(relationship_body.decode('utf-8-sig')), delimiter='|'):
    if row['GEOID_COUNTY_20'] != COUNTY or not row['GEOID_ZCTA5_20']:
        continue
    parts_in_county[row['GEOID_ZCTA5_20']] = {
        'land_in_county': int(row['AREALAND_PART']),
        'land_total': int(row['AREALAND_ZCTA5_20']),
    }

gazetteer_zip = zipfile.ZipFile(io.BytesIO(gazetteer_body))
gazetteer_text = gazetteer_zip.read(gazetteer_zip.namelist()[0]).decode('utf-8')
reader = csv.reader(io.StringIO(gazetteer_text), delimiter='\t')
header = [column.strip() for column in next(reader)]
zips = []
for values in reader:
    row = dict(zip(header, (value.strip() for value in values)))
    part = parts_in_county.get(row['GEOID'])
    if not part:
        continue
    zips.append({
        'zip': row['GEOID'],
        'lat': float(row['INTPTLAT']),
        'lon': float(row['INTPTLONG']),
        'landSqMiInCounty': part['land_in_county'] / SQUARE_METRES_PER_SQUARE_MILE,
        'landShareInCounty': part['land_in_county'] / part['land_total'] if part['land_total'] else 0,
    })
zips.sort(key=lambda entry: entry['zip'])

fetch_date = relationship_source['fetched_at'][:10]
content = json.dumps(zips, separators=(',', ':'), sort_keys=True).encode()
snapshot = {
    'snapshotId': f"ZCTA_centroids@{fetch_date}#{hashlib.sha256(content).hexdigest()[:8]}",
    'description': 'Census 2020 ZCTA internal points for every ZCTA with any area in Montgomery County, Ohio (county 39113)',
    'sources': [gazetteer_source, relationship_source],
    'zips': zips,
}
out = Path(__file__).parent / f'zip-centroids@{fetch_date}.json'
out.write_text(json.dumps(snapshot, indent=1, sort_keys=True) + '\n')
print(f'wrote {out.name}: {len(zips)} zips')
