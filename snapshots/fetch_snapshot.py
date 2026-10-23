import json, hashlib, urllib.request, urllib.parse, datetime, os, sys

BASE = "https://services.arcgis.com/3TIUdMHOqnLBrZEH/arcgis/rest/services"
LAYERS = [
    ("pantries", "MC_Pantries", 35),
    ("retailers", "SNAP_or_WIC_Acceptance", 3),
    ("routes", "MC_Food_Transp", 18),
    ("block-groups", "Quantile_Vehicle", 27),
    ("lila-tracts", "Low_Income_Low_Access", 33),
]
OUT = sys.argv[1]
ONLY = set(sys.argv[2:])
unknown = ONLY - {label for label, _, _ in LAYERS}
if unknown:
    sys.exit(f"unknown layer label(s): {sorted(unknown)}")
fetch_date = datetime.date.today().isoformat()

def get_json(url):
    with urllib.request.urlopen(url, timeout=60) as response:
        return json.loads(response.read())

manifest_path = os.path.join(OUT, "manifest.json")
if ONLY and os.path.exists(manifest_path):
    with open(manifest_path) as handle:
        manifest = json.load(handle)
    manifest["layers"] = [layer for layer in manifest["layers"] if layer["label"] not in ONLY]
else:
    manifest = {"fetched_on": fetch_date, "source": BASE, "layers": []}
for label, service, layer_id in LAYERS:
    if ONLY and label not in ONLY:
        continue
    layer_url = f"{BASE}/{service}/FeatureServer/{layer_id}"
    layer_info = get_json(layer_url + "?f=json")
    features, offset, pages = [], 0, 0
    while True:
        params = {"where": "1=1", "outFields": "*", "returnGeometry": "true", "outSR": "4326",
                  "orderByFields": layer_info.get("objectIdField", "OBJECTID"),
                  "resultOffset": offset, "f": "geojson"}
        page = get_json(layer_url + "/query?" + urllib.parse.urlencode(params))
        pages += 1
        batch = page.get("features", [])
        features += batch
        offset += len(batch)
        exceeded = page.get("exceededTransferLimit") or page.get("properties", {}).get("exceededTransferLimit")
        if not exceeded or not batch:
            break
    count = get_json(layer_url + "/query?where=1%3D1&returnCountOnly=true&f=json")["count"]
    fetched_at = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    collection = {"type": "FeatureCollection", "features": features}
    body = json.dumps(collection, separators=(",", ":"), sort_keys=True).encode()
    name = f"{service}@{fetch_date}.geojson"
    with open(os.path.join(OUT, name), "wb") as handle:
        handle.write(body)
    schema_name = f"{service}@{fetch_date}.schema.json"
    schema = {k: layer_info.get(k) for k in ("name", "geometryType", "objectIdField", "fields", "editingInfo", "description", "copyrightText", "maxRecordCount")}
    schema_body = json.dumps(schema, indent=1, sort_keys=True).encode()
    with open(os.path.join(OUT, schema_name), "wb") as handle:
        handle.write(schema_body)
    manifest["layers"].append({
        "label": label, "service": service, "layer_id": layer_id, "layer_name": layer_info.get("name"),
        "file": name, "schema_file": schema_name,
        "query_url": layer_url + "/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson&resultOffset=<paged>",
        "fetched_at": fetched_at, "pages": pages, "feature_count": len(features), "server_count": count,
        "source_last_edit_epoch_ms": (layer_info.get("editingInfo") or {}).get("lastEditDate"),
        "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest(),
        "schema_sha256": hashlib.sha256(schema_body).hexdigest(),
    })
    print(label, len(features), count, pages)
with open(manifest_path, "w") as handle:
    json.dump(manifest, handle, indent=2)
