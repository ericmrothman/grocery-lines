# MVRPC snapshot 2026-10-03: what the data looks like

Fetched 2026-10-03 16:29 UTC from `services.arcgis.com/3TIUdMHOqnLBrZEH` with `outFields=*`, `f=geojson`, paged by `resultOffset` (each layer fit in one page; maxRecordCount is 2000). Hashes, query URLs and server counts are in `manifest.json`; each layer's field list and aliases are in its `.schema.json`. `fetch_snapshot.py` reproduces the pull. GeoJSON is written with sorted keys and no whitespace, so the sha256 covers exactly the bytes on disk.

| Layer | File | Features | Brief said | Geometry |
|---|---|---|---|---|
| Pantries (MC_Pantries/35) | `MC_Pantries@2026-10-03.geojson` | 73 | 73 | Point |
| Retailers (SNAP_or_WIC_Acceptance/3) | `SNAP_or_WIC_Acceptance@2026-10-03.geojson` | 475 | 475 | Point |
| Routes (MC_Food_Transp/18) | `MC_Food_Transp@2026-10-03.geojson` | 41 | 41 routes | 14 LineString, 27 MultiLineString |
| Block groups (Quantile_Vehicle/27) | `Quantile_Vehicle@2026-10-03.geojson` | 422 | 422 | Polygon |

All counts hold, but "41 routes" is really 41 features covering about 29 routes (see Routes).

GTFS: fetched separately at 16:34 UTC from `https://proc.greaterdaytonrta.org/gtfs/google_transit.zip` (the `http://` form is still refused by the network policy). See the GTFS section below.

## Block groups (Quantile_Vehicle)

- GEOID is a 12-character string for all 422 (all start `39113`, Montgomery County). Block groups, confirmed. `GEO_ID` and `GEO_ID_1` duplicate it.
- `PercentNoVehicle` runs **0 to 100** (min 0, max 76.9, median 4.9), not 0 to 1. `Percent_of_Occcupied_Houses_Wit` holds the same value as a 0 to 1 fraction (note the typo'd field name).
- `PercentNoVehicle` equals `No_Vehicle / Total_Occupied_Housing_Units × 100` for every row, so it can be re-derived.
- One block group (`391139800001`, a special-use tract 9800 block group) has no households, so `PercentNoVehicle` is null. The engine must treat it as "no data", not 0.
- `POP`, `OCC_HU`, `TOT_HU`, `VAC_HU` (aliased "…, 2020") are **0 in all 422 rows**: a failed join. Use `Total_Occupied_Housing_Units`, not `OCC_HU`. There is no usable population field.
- The layer states no ACS vintage. The same layer carries SNAP fields (`PercentWithSNAP`, `PercentNoSNAP`).
- 84 block groups have `PercentNoVehicle > 15`.

## Routes (MC_Food_Transp/18)

- Fields: `Route_Name` (string), `PeakHDWay`, `OffPeakHDW` (small int, minutes), `Length` (miles; matches geometry for most), `Type`, `System` ("GDRTA"), `Id` (null or 0, useless).
- `Type`: `GDRTA Route` 32, `No Flag Stops` 6, `Flex Route` 3. The 9 non-"GDRTA Route" features are all named `Red` and are short segments (0.2 to 3.7 mi) with no headways.
- Route names are inconsistent: `03`, `07`, `08` are zero-padded, others aren't; variants `1-Sel`, `2-Sel`, `16Sel`, `23Sel`, `4-N&S`, `9-N&S`, `9WKDY`, `X1A`, `N`. Route `24` appears twice (one is a 0-length stub).
- **Headways: 21 of 41 features have no usable headway.** `PeakHDWay`: null 14, 0 for 7 (all the Sel / N&S / WKDY variants), otherwise 15 (2), 20 (1), 25 (5), 30 (5), 60 (4), 240 (3). `OffPeakHDW`: null 14, 0 for 7, otherwise 20 to 240. Routes 28, 43, 44, 55, N and every `Red` segment are null.
- 240-minute headways (routes 03, 05, X1A peak; 24 off-peak) look like a "few trips a day" code, not a real headway. Halving it gives a 120 min wait.
- Route 12 has peak 30 / off-peak 25, so off-peak is not always slower.
- Geometry: 27 of 41 are MultiLineString (up to 39 parts for route 43). Parts are not ordered end to end, so "distance along the route" needs care. Many routes are loops or out-and-back (07, 08, 12, 14, 16, 17, 18, 19, 22, 4, 43 and others have a part that closes on itself).
- `Length` disagrees with the geometry for 1 (14.6 vs 11.3 mi), 16, 18, 24, 43 and X1A; it is null for 28, 44, 55 and N.
- Within 0.5 mi of Wright Stop Plaza (39.7589, −84.1918): routes 1, 2, 03, 4, 5, 07, 08, 9, 12, 14, 16, 17, 18, 19, 22, 43, X1A, plus five `Red` segments. Not within: 23, 24, 28, 44, 55, 60, N and the Sel / N&S / WKDY variants. Route 9WKDY is 0.92 mi away.

## Retailers (SNAP_or_WIC_Acceptance/3)

- No hours fields at all, as expected. `USER_ZIP_CODE` is a number; `USER_ESTABLISHMENT` and addresses have trailing spaces and are uppercase.
- `USER_ACCEPTS_SNAP` YES 405 / NO 70; `USER_ACCEPTS_WIC` YES 30 / NO 445; `SNAPWICaccept` summarizes as SNAP 375, BOTH 30, NEITHER 70.
- `USER_STORE_TYPE` (20 values): GAS STATION 191, DISCOUNT STORE 73, CONVENIENCE STORE 61, FULL SERVICE GROCERY 45, ETHNIC MARKET 30, DRUGSTORE 24, INTERNATIONAL MARKET 11, SPECIALTY MEAT STORE 9, HEALTH FOOD STORE 7, BULK FOOD STORE 5, FARM MARKET 4, SMALL SCALE GROCERY 4, WAREHOUSE STORE 3, DEPARTMENT STORE 2, and 1 each of PRODUCE MARKET, FARM SUPPLY STORE, ETHNIC GROCERY, HOME IMPROVEMENT STORE, URBAN FARM, BAKERY OUTLET.
- The 45 FULL SERVICE GROCERY rows are Aldi, Kroger, Meijer, Walmart Supercenter, Save-A-Lot, Dorothy Lane, Dot's, IGA, Trader Joe's, Whole Foods, Gem City Market Cooperative and a few independents. That is the natural "supermarket" set; whether SMALL SCALE GROCERY or ETHNIC GROCERY count is a method decision.
- Two retailers geocode to Greene County. Geocode match scores are 100 for 439 of 475, lowest 84.

## Pantries (MC_Pantries/35)

- **`USER_SCHEDULE` is a 3-value category, not hours**: `Set Hours` 55, `By Appointment Only` 10, `Check Website or Call for Details` 8. The actual hours are free text in `USER_DETAILS` (69 distinct values, none blank).
- Eligibility limits (zip codes, ID, "Women only") sit in `USER_NOTES` for 5 pantries and sometimes inside `USER_DETAILS`.
- `Partner`: Foodbank 52, Miami Valley Meals 11, both 10. Some entries are hot-meal sites, not pantries (name contains "HOT MEAL SITE").
- 39 `USER_PHONE` values start with a newline; one is "(937) 952-5715 or text (937) 795-3643"; another has "x174". `USER_WEBSITE` is blank for 16.
- Four BOGG mobile pantries share one phone and "Check website for dates and times"; their points are a fixed base, not where food is handed out.
- Geocodes: 72 matched, 1 tied (Five Loaves, Spaulding Rd); scores 97.9 to 100.

Patterns a parser must handle in `USER_DETAILS` (all verbatim):
- Weekly: `Tuesday: 2:00pm - 4:00pm`, `Monday - Friday: 8:00am - 12:00pm`, `Monday, Wednesday, Thursday: 10:00am - 1:00pm`, `Tuesday & Thursday: 9:00am - 11:30am`
- Nth weekday: `2nd & 4th Wednesday of the month: 4:00pm - 6:00pm`, `3rd Tuesday: 4:00pm - 6:00pm`, `Second Tuesday: 10:00am - 12:00pm `, `Last Friday of the month lunch is served: 11:30am - 1:00pm`
- Biweekly with no anchor date: `Bi-weekly Thursdays: 3:00pm - 4:30pm, BY APPOINTMENT no later than Monday at midnight`
- Start time only: `Thursday: 5:30pm`, `Tuesday & Thursday: 11:00am`
- Exceptions: `Monday - Friday: 9:30am - 11:30am, Closed 1st Friday of the month`; `(if there are 5 Saturdays in the month, they will not operate the 2nd Thursday)`
- Data errors: `Tuesday & Thursday: 9:00am - 12:00am, 1:00pm - 4:00pm` (12:00am means noon); `9:00am-1:00pm` without spaces; leading space; `5:00 pm` with a space.
- Multiple services in one field split by ` / `: `Pantry Hours: 3rd Saturday of the month: 11:00am - 1:00pm / Hot Meal Hours: Thursdays: 5:30pm - 7:00pm `
- "Set Hours" rows that still need a call: `Monday - Thursday: 9:00am - 2:00pm, MUST CALL FROM PARKING LOT (937) 224-3003, press 0`; `Monday & Wednesday: 1:00pm - 6:00pm, 2nd & 3rd Friday of month, Fridays BY APPOINTMENT ONLY`
- A "Check Website" row that does have hours: `Must call Monday at 9:00am & Friday at 9:00am for appointment for Pantry at 10:00am - 12:00pm / Wednesday: 6:00pm - 8:00pm for walk-ins, 2nd Saturday of month: 10:00am - 12:00pm for walk ins`
- No hours: `Check website for dates and times`, `Call for availability`, `Call for more information`

## GDRTA GTFS (`GDRTA_GTFS@2026-10-03.zip`)

- Feed version S1000327, valid 2026-09-06 to 2027-01-02, server last-modified 2026-09-08. 6.6 MB zip; 2,632 stops, 4,111 trips, 22 routes, shapes included. No `frequencies.txt` or `transfers.txt` rows and no `calendar_dates` exceptions.
- Service days: `1` Mon–Thu, `3` Friday, `4` Saturday, `2` Sunday. Saturday and Sunday run the same 21 routes minus the Flyer on Sunday; route 55 runs Saturday but not Sunday.
- Wright Stop Plaza is four stops (`3065`–`3068`, W/E/S/N bays) at 39.75884, −84.19068, about 0.06 mi from the brief's coordinate. Routes serving it: 1, 2, 3, 4, 6, 7, 8, 9, 12, 16, 17, 18, 19, 22, 43, 44, X12, X6. Routes 55, 71 (West Connector) and the Flyer don't stop there; route 999 is "TEST ROUTES" and should be dropped.

**The MVRPC route layer does not match current service.** GTFS has 6, 71, X6, X12 and the Flyer, which MVRPC lacks; MVRPC has 5, 14, 23, 24, 28, 60, N and X1A, which GTFS lacks.

**Real headways are much longer than MVRPC's.** Mon–Thu median gap between departures from each route's first stop, per direction (6–9 am / 10 am–2 pm):

| Route | GTFS peak | GTFS midday | MVRPC PeakHDWay |
|---|---|---|---|
| 1 | 37–38 | 32–37 | 20 |
| 2 | 50 | 47–50 | 25 |
| 3 | 35 | 35 | 240 |
| 4 | 45–47 | 36–45 | 25 |
| 6 | 60 | 51–60 | (absent) |
| 7 | 38 | 37–38 | 15 |
| 8 | 32 | 27–31 | 15 |
| 9 | 52 | 51–52 | 25 |
| 12 | 45 | 45 | 30 |
| 16 | 51–55 | 49–55 | 25 |
| 17 | 55–57 | 56–57 | 30 |
| 18 | 47–50 | 47–50 | 25 |
| 19 | 44–48 | 38–49 | 30 |
| 22 | 42 | 41–42 | 30 |
| 43 | 55 | gap | null |
| 44 | 55 | 63 | null |
| 71 | 44–46 | 45–47 | (absent) |
| X12 | 54–56 | 55 | (absent) |
| X6 | none | 38 (8:45 am–5 pm only) | (absent) |
| Flyer | 10 | 10 | (absent) |

Caveat: these are first-stop departure gaps, so short-turn trips or interlined variants could shift them; they are a profile, not the engine's method. Routes 8 and 7, the brief's example routes, run about every 30–38 minutes, not 15, so the brief's wait penalty is understated by roughly half.

## Zip code centres (`zip-centroids@2026-10-03.json`)

- Built by `snapshots/build_zip_centroids.py` from two Census 2020 files: the Gazetteer ZCTA file (internal points) and the ZCTA-to-county relationship file. The source URLs, sha256 and fetch time of both sit inside the JSON; `snapshotId` hashes the zip list.
- 40 ZCTAs have land or water in Montgomery County (39113). 26 lie wholly inside it; others barely touch it (45005 Franklin 0.6%, 45344 0.2%, 45042 0.9%), so their internal point is outside the county. The app treats a zip whose centre is outside the county like any outside place: trips fall back to the example start with a note.
- A ZCTA is a Census approximation of a USPS zip code, not the same thing; PO-box-only zips (for example 45401) have no ZCTA and read as "not in Montgomery County".

## Streets (`streets@2026-10-03.json`)

- Built by `snapshots/build_streets.py` from one Overpass query for every road and path in the county plus about two miles around it, dated `[date:"2026-10-03T19:51:06Z"]` so a rerun returns the same ways (re-fetched 2026-10-06: the same 83,330,076-byte response, and with the old rules the same graph, `OSM_streets@2026-10-03#354d2c33`).
- DEF-005b: parking aisles (`service=parking_aisle`) are walkable but not drivable; crossings, traffic islands and access aisles (`footway=crossing|traffic_island|access_aisle`) are walkable like any footway. Mapped sidewalks (`footway=sidewalk`) stay out: they run beside streets that are already walkable, and adding them made no difference to the benchmark (the Google Maps comparison in notebook 03) while adding 0.4 MB. Driveways, drive-throughs and emergency access stay out. 127,205 nodes, 167,019 edges, 4.6 MB (was 3.9 MB).
- DEF-053 (2026-10-13): rechecked leaving mapped sidewalks out, for the one case where it could matter: trunk roads are not walkable, so a sidewalk beside one could be the only legal way along it. The network's 436 trunk and trunk-ramp edges (118 km) sit in 46 tiles of 0.02°; Overpass returned 234 mapped sidewalks in those tiles (as mapped on 2026-10-13: the server refused queries dated to the network's OSM date). 12 of them, 0.7 km, run within 30 m of a trunk road. Joined to the walking network where their points meet its nodes (within 2 m), they shorten no walk between connected points by more than 53 m (one place, near 39.819, -84.284, under a minute on foot), and otherwise only link two footway islands of 2 and 8 nodes that no hexagon, store, pantry or bus stop walks from (none of 11,748 such points has an entry node on them). The baseline stands: sidewalks stay out. The check was a one-off and is not part of the build.
- A walk may join the network at any walkable node within 0.02 mi (about 30 m) of its nearest one, whichever gives the shortest walk overall, so a store set back in a parking lot is reached across the lot rather than around it. Against 60 Google walking routes of 0.35 to 0.95 mi straight-line distance, median distance error fell from 0.075 to 0.029 mi and bias from +0.051 to -0.009 mi.

## Census 2020 blocks (`census-blocks@2026-10-06.json`)

- Built by `snapshots/build_census_blocks.py` from the 2020 TIGER/Line block file for Ohio (`tl_2020_39_tabblock20.zip`, 280 MB; URL, sha256 and fetch time inside the JSON). Keeps the 8,384 of Montgomery County's 9,932 blocks that have at least one housing unit (251,523 housing units, `HOUSING20`).
- Each block carries the points where its homes are counted: the points of a fixed 0.1-mile lattice that fall inside the block, or its internal point when the block is smaller than that (44,946 points). Homes are shared equally among a block's points, so a large rural block spreads thin instead of landing in one hexagon.
- Only `snapshots/build_surface.js` reads it. Each block group's ACS households (`Total_Occupied_Housing_Units`) are shared among its hexagons in proportion to the 2020 housing units counted in each, so every block group keeps its exact household total. A hexagon counts as lived-in when its households reach 250 per square mile of its own area (about 13.5 households); a hexagon with no homes is always masked.
- 2020 blocks nest in the same block groups as the ACS layer (all 421 block groups with homes match; 391139800001 has none). Housing units are not households: the ratio of ACS households to 2020 housing units runs from 0.24 to 2.19 by block group, which is why the counts set where the households are, not how many.
- Not used: the Census API (it now needs a key) and OpenStreetMap sidewalk and shelter tags. In a central Dayton test box only 31% of streets carry any sidewalk tag and 91 of 4,000 say "no"; the whole county has 25 bus stops in OpenStreetMap against GDRTA's 2,632, 6 tagged with a shelter. GDRTA's GTFS has no shelter field. Neither is complete enough to say where sidewalks or shelters are missing.
