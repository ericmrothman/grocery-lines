const PARAMS = {
  supermarketStoreTypes: {
    label: 'Stores counted as supermarkets',
    topic: 'food',
    value: ['FULL SERVICE GROCERY'], unit: 'store types',
    basis: 'assumed',
    evidence: 'agency-data',
    rationale: 'Retailers classified as full-service grocery in the MVRPC SNAP retailer database (45 stores in Montgomery County, including Kroger, Aldi, Meijer and Gem City Market). While smaller convenience retailers, dollar stores and ethnic grocers appear on the map, our high-need findings focus on full-service supermarkets because they provide comprehensive, year-round access to fresh produce, meats and staple foods.',
  },

  maxWalkMi: {
    label: 'Maximum walking trip distance',
    topic: 'walking',
    value: 1.0, unit: 'mi along streets',
    basis: 'source',
    evidence: 'published-standard',
    rationale: 'Taken from the USDA Food Access Research Atlas urban standard. While someone can walk further in an emergency, carrying groceries on foot more than 1 mile is recognized by researchers as an access barrier. When the destination is farther than 1 mile, the model requires transit; if no bus connects, it is flagged as having no viable transit trip.',
    citation: 'USDA ERS Food Access Research Atlas documentation (low access: 1 mile urban); FHWA NHTS Brief, Non-Motorized Travel, 2017 NHTS',
  },
  walkMph: {
    label: 'Walking speed',
    topic: 'walking',
    value: 3, unit: 'mph',
    basis: 'brief',
    rationale: 'A standard average adult walking pace along streets and pedestrian paths. Seniors, parents walking with small children and anyone carrying heavy grocery bags often walk slower, making actual travel times longer.',
  },

  routeTypes: {
    label: 'Transit network evaluated',
    topic: 'bus',
    value: ['GDRTA Route'], unit: 'route Type values',
    basis: 'assumed',
    evidence: 'agency-data',
    rationale: 'All regularly scheduled, fixed-route bus lines operated by the Greater Dayton Regional Transit Authority (GDRTA). On-demand and flex services without fixed schedules are excluded from timetable routing.',
  },
  catchmentMi: {
    label: 'Bus stop walking catchment',
    topic: 'bus',
    value: 0.5, unit: 'mi',
    basis: 'assumed',
    rationale: 'While transit planners often use a quarter-mile walk for local bus stops, our baseline model allows up to a half-mile walk (about 10 to 12 minutes) as a generous upper bound for reaching transit in Montgomery County. We also test a quarter-mile (0.25 mi) in our sensitivity checks.',
  },
  transferWalkMi: {
    label: 'Maximum walking distance between connecting buses',
    topic: 'bus',
    value: 0.5, unit: 'mi',
    basis: 'assumed',
    rationale: 'The farthest a rider walks, in a straight line, from one bus to a stop on another line: between the bays at Wright Stop Plaza, or a few blocks to catch a connection sooner than waiting. The walk counts at walking speed on top of the transfer buffer, so a longer walk is only used when it gets the rider there sooner. We also test a quarter-mile and a full mile in our sensitivity checks.',
  },
  minConnectionMin: {
    label: 'Minimum transfer buffer',
    topic: 'bus',
    value: 3, unit: 'min',
    basis: 'assumed',
    rationale: 'The minimum time needed to step off one bus, cross the station platform and board a connecting bus, on top of any walking time between stops. Once at the connecting stop, the rider waits for the next bus scheduled on the real timetable.',
  },
  departureStepMin: {
    label: 'Schedule departure sampling',
    topic: 'bus',
    value: 5, unit: 'min',
    basis: 'assumed',
    rationale: 'Bus travel times depend on when a rider leaves home. We calculate trips departing every 5 minutes across the service window on GDRTA\'s real timetable, reporting the median trip alongside the best-case and worst-case departures. With an even number of departures we take the lower median, the shorter of the two middle trips, so the trip shown is a real one whose steps add up.',
  },
  rushHourDeparturesMin: {
    label: 'Morning rush-hour window',
    topic: 'bus',
    value: [360, 540], unit: 'minutes after midnight (6-9 am)',
    basis: 'assumed',
    rationale: 'The morning transit service window evaluated for weekday trips.',
  },
  middayDeparturesMin: {
    label: 'Midday service window',
    topic: 'bus',
    value: [600, 840], unit: 'minutes after midnight (10 am-2 pm)',
    basis: 'assumed',
    rationale: 'The midday transit service window evaluated for off-peak grocery trips.',
  },
  shortestRideMi: {
    label: 'Shortest bus ride counted',
    topic: 'bus',
    value: 0.5, unit: 'mi',
    basis: 'assumed',
    rationale: 'A rider does not board a bus to go less than half a mile, the same distance the model already treats as a reasonable walk to a stop. Without this floor the trip search, which only looks for the earliest arrival, would board a bus for one stop or a single minute just to reach a better stop to wait at. Rides shorter than half a mile along the route are not counted.',
  },
  maxBusRides: {
    label: 'Maximum bus rides in a single trip',
    topic: 'bus',
    value: 8, unit: 'buses',
    basis: 'assumed',
    rationale: 'A safety ceiling for the trip search. In the neighborhood findings, no trip uses more than 3 transfers.',
  },

  motorwayMph: {
    label: 'Highway driving speed',
    topic: 'driving',
    value: 55, unit: 'mph',
    basis: 'assumed',
    rationale: 'Estimated average speed on interstates and expressways, including entrance ramps and merging.',
  },
  arterialMph: {
    label: 'Main road driving speed',
    topic: 'driving',
    value: 35, unit: 'mph',
    basis: 'assumed',
    rationale: 'Estimated average speed on primary arterial roads, including traffic light delays.',
  },
  collectorMph: {
    label: 'Secondary road driving speed',
    topic: 'driving',
    value: 30, unit: 'mph',
    basis: 'assumed',
    rationale: 'Estimated average speed on secondary and cross-town corridors.',
  },
  localMph: {
    label: 'Neighborhood street driving speed',
    topic: 'driving',
    value: 25, unit: 'mph',
    basis: 'assumed',
    rationale: 'The standard speed limit on residential streets.',
  },
  serviceRoadMph: {
    label: 'Parking lot and driveway speed',
    topic: 'driving',
    value: 10, unit: 'mph',
    basis: 'assumed',
    rationale: 'Low-speed driving in parking lots, alleys and private driveways.',
  },
  junctionDelayMin: {
    label: 'Delay per major intersection',
    topic: 'driving',
    value: 0.05, unit: 'min per intersection',
    basis: 'assumed',
    rationale: 'A small time allowance added for every intersection where three or more drivable roads meet, for stop signs, traffic signals and turning vehicles.',
  },
  parkingMin: {
    label: 'Parking and store walk-in allowance',
    topic: 'driving',
    value: 2.0, unit: 'min',
    basis: 'brief',
    rationale: 'The estimated time needed to park the car, turn off the engine and walk from the parking lot to the supermarket entrance.',
  },
  circuityFactor: {
    label: 'Street detour allowance for unmapped paths',
    topic: 'driving',
    value: 1.3, unit: '× straight-line',
    basis: 'brief',
    rationale: 'Nearly all trips follow exact street centerlines from OpenStreetMap. In rare locations where a direct street connection is missing from the map data, we add a 30% detour over the straight-line distance to approximate a typical street grid.',
  },

  shortTripDriveMin: {
    label: 'Trips too short to compare ratios',
    topic: 'comparing',
    value: 5, unit: 'min',
    basis: 'assumed',
    rationale: 'For drives under 5 minutes, fixed overhead such as parking and walking to the bus stop distorts the ratio (a 2-minute drive against a 10-minute bus ride makes the bus look 5 times slower). For these short trips, we report the actual minute difference rather than a disparity ratio.',
  },
  strainedRatio: {
    label: 'Elevated disparity threshold',
    topic: 'comparing',
    value: 2.0, unit: '×',
    basis: 'brief',
    rationale: 'Trips where riding transit takes at least twice as long as driving the same trip.',
  },
  severeRatio: {
    label: 'Severe disparity threshold',
    topic: 'comparing',
    value: 3.5, unit: '×',
    basis: 'brief',
    rationale: 'Trips where riding transit takes at least three and a half times as long as driving the same trip.',
  },

  desertCarlessPct: {
    label: 'High-need neighborhood carless threshold',
    topic: 'highNeed',
    value: 15, unit: '% of households',
    basis: 'brief',
    rationale: 'A Census block group is identified as high-need when more than 15% of occupied households report having no vehicle in the U.S. Census Bureau ACS data. Across Montgomery County, 84 of 422 block groups meet this threshold, home to 11,137 carless households.',
  },
  desertTransitMin: {
    label: 'High-need transit travel time line',
    topic: 'highNeed',
    value: 25, unit: 'min',
    basis: 'brief',
    rationale: 'A hexagon is past the line when the fastest transit or walking trip from where its homes are to a full-service supermarket takes 25 minutes or more, in the whole minutes the trip cards show. Approaching an hour round-trip (not including shopping or waiting for a bus home), this travel time is an unreasonable barrier to getting groceries without a car.',
  },

  cellSizeMi: {
    label: 'Map grid hexagon size',
    topic: 'map',
    value: 0.25, unit: 'mi between neighbouring centres',
    basis: 'assumed',
    rationale: 'The map divides the county into a uniform grid of hexagons spaced a quarter-mile apart (about 35 acres each). Travel times are calculated from the center of every hexagon.',
  },
  maskHouseholdsPerSqMi: {
    label: 'Residential density threshold for neighborhood totals',
    topic: 'map',
    value: 250, unit: 'households per sq mi of land',
    basis: 'assumed',
    rationale: 'Every area shows travel times on the map. This line marks which cells are densely lived-in (about 14 households in a quarter-mile hexagon). A cell\'s households come from the 2020 Census blocks inside it. High-need hexagons must be lived-in by this line, so a sparse rural cell with a long trip but few homes is shown on the map but not counted as high-need.',
  },
};

function freezeMethod(version, params) {
  const frozenParams = Object.entries(params).map(([name, parameter]) => [name, Object.freeze({ ...parameter })]);
  return Object.freeze({
    version,
    params: Object.freeze(Object.fromEntries(frozenParams)),
  });
}

export const METHOD = freezeMethod('2026.12-shortest-ride', PARAMS);

export const CALIBRATION = Object.freeze({
  benchmarkTrips: 52,
  departure: 'a Tuesday at 8:00 am',
  driveMedianAbsMin: 0.79,
  transitArrivalMedianAbsMin: 1.44,
  walkDistanceRoutes: 60,
  walkDistanceMedianAbsMi: 0.0292,
  googleWalkMph: 2.71,
  tolerance: Object.freeze({ medianAbsTransitMin: 3.5, medianAbsDriveMin: 2.0, absoluteBiasMin: 1.5 }),
});

export function param(method, name) {
  const parameter = method.params[name];
  if (!parameter) throw new Error(`Unknown method parameter: ${name}`);
  return parameter.value;
}

export function withOverrides(method, overrides) {
  const params = { ...method.params };
  for (const [name, value] of Object.entries(overrides)) {
    if (!params[name]) throw new Error(`Unknown method parameter: ${name}`);
    params[name] = { ...params[name], value, basis: 'override' };
  }
  const overrideTag = Object.entries(overrides).map(([name, value]) => `${name}=${value}`).join(',');
  return freezeMethod(`${method.version}+${overrideTag}`, params);
}

export function describeMethod(method) {
  return Object.entries(method.params).map(([name, parameter]) => ({ name, ...parameter }));
}
