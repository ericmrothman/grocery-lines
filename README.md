# Grocery Lines

**How traditional food desert maps overlook neighborhoods that rely on public transit.**

This repository holds the code, data snapshots, and replication notebooks behind **Grocery Lines**, an interactive story and map exploring how long it takes to reach a supermarket by car, on foot, and by bus across Montgomery County, Ohio.

Everything here is built to be easy to inspect and run on your own machine—plain HTML, CSS, and JavaScript in the browser, with no build step, external packages, or API keys required.

## Running It Locally

All you need is **Python 3** (no `npm install` or `pip install` needed):

```bash
# Start a local web server at http://127.0.0.1:8080 (or: npm run serve)
python3 -m http.server 8080 --bind 127.0.0.1

# Re-run all four Python replication notebooks from scratch
python3 notebooks/run_notebooks.py
```

Once the server is running, open [`http://127.0.0.1:8080/`](http://127.0.0.1:8080/) to read the story and methodology, or [`http://127.0.0.1:8080/explore.html`](http://127.0.0.1:8080/explore.html) to explore the county map.

## What's Where

```text
index.html          The visual story and full Methodology
explore.html        The interactive Montgomery County map, route finder, and CSV export
service-worker.js   Offline caching for repeat visits
src/                The core routing, bus schedule, and hexagon grid calculations
src/ui/             Browser interface code (story/, map/, dossier/, grocery/, methodology/, shared/)
snapshots/          Dated data snapshots, map tiles, and the scripts that fetch and build them
notebooks/          Four plain-Python notebooks (01–04) that check every number in the story,
                    plus the Google Maps benchmark trips and walks that notebook 03 compares against
vendor/             Local copies of MapLibre GL, PMTiles, and map fonts
```

## Checking the Numbers (`notebooks/`)

If you want to see how the numbers are made—or check our math—the four Jupyter notebooks in [`notebooks/`](./notebooks/) recalculate every figure in the story from the data snapshots using only plain Python, with step-by-step explanations along the way:

1. **[`01_sources_and_food_places.ipynb`](./notebooks/01_sources_and_food_places.ipynb)** — Checks the data files and sorts Montgomery County's 548 food retailers into 45 full-service supermarkets, 73 food pantries, and 430 other stores, alongside the 35 urban USDA low-income, low-access tracts.
2. **[`02_hexagons_and_households.ipynb`](./notebooks/02_hexagons_and_households.ipynb)** — Divides the county into 8,568 equal-sized hexagons, maps 2020 Census block housing counts and car ownership across 422 block groups, and filters for the 2,933 neighborhoods where people live.
3. **[`03_trips_and_calibration.ipynb`](./notebooks/03_trips_and_calibration.ipynb)** — Times driving, walking, and bus trips across real streets and weekday GDRTA bus schedules, traces the 22 Northridge grocery runs ride by ride, and compares the model against 52 Google Maps trips and 60 walking routes.
4. **[`04_high_need_and_sensitivity.ipynb`](./notebooks/04_high_need_and_sensitivity.ipynb)** — Identifies the 265 high-need neighborhoods (where more than 15% of households lack a car and the bus to a supermarket takes 25 minutes or more), tests different cutoffs, and compares the results against traditional USDA food desert tracts.

## Data Sources

The downloaded source files in [`snapshots/`](./snapshots/) are pinned with SHA-256 fingerprints in [`snapshots/manifest.json`](./snapshots/manifest.json), and the derived travel-time, street, and transit snapshots are verified by [`notebooks/01_sources_and_food_places.ipynb`](./notebooks/01_sources_and_food_places.ipynb):

- **Miami Valley Regional Planning Commission (MVRPC)**: SNAP/WIC retailers, emergency food pantries, American Community Survey 5-year vehicle ownership by block group, and USDA Food Access Research Atlas tracts.
- **U.S. Census Bureau**: 2020 Decennial Census block boundaries and housing unit counts.
- **Greater Dayton RTA**: Weekday GTFS bus schedules, stops, and route lines.
- **OpenStreetMap & Protomaps**: Montgomery County streets, footpaths, and basemap tiles (ODbL 1.0).
