import { param } from './method.js';
import { haversineMi, milesPerDegreeAt } from './geo.js';
import { walkingLegFromStart, walkingLegToEnd } from './street_legs.js';

const CACHED_ORIGINS = 8;

function sortedByLatitude(stops) {
  const order = stops.map((stop) => stop.index).sort((southern, northern) => stops[southern].lat - stops[northern].lat);
  return { order, latitudes: order.map((index) => stops[index].lat) };
}

function firstAtOrNorthOf(latitudes, latitude) {
  let low = 0;
  let high = latitudes.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (latitudes[middle] < latitude) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function decodeTimetable(snapshot) {
  const stops = snapshot.stops.map((stop, index) => ({ ...stop, index }));
  const patterns = snapshot.patterns.map((pattern, index) => ({ ...pattern, index }));
  const visitsAtStop = stops.map(() => []);
  for (const pattern of patterns) {
    pattern.stops.forEach((stopIndex, position) => visitsAtStop[stopIndex].push({ pattern, position }));
  }
  const timetable = {
    snapshotId: snapshot.snapshotId,
    fastestStraightLineMph: snapshot.fastestStraightLineMph,
    stops,
    patterns,
    visitsAtStop,
    byLatitude: sortedByLatitude(stops),
  };
  return { ...timetable, footpathsByWalkMi: new Map() };
}

function footpathsFrom(timetable, transferWalkMi) {
  if (!timetable.footpathsByWalkMi.has(transferWalkMi)) {
    const footpaths = timetable.stops.map((stop) => stopsWithin(timetable, stop, transferWalkMi)
      .map(({ stop: nearbyStop, distanceMi }) => ({ stop: nearbyStop, distanceMi })));
    timetable.footpathsByWalkMi.set(transferWalkMi, footpaths);
  }
  return timetable.footpathsByWalkMi.get(transferWalkMi);
}

export function withTimetable(network, timetableSnapshot) {
  return { ...network, timetable: decodeTimetable(timetableSnapshot) };
}

export function stopsWithin(timetable, point, radiusMi) {
  const { milesPerLatitudeDegree, milesPerLongitudeDegree } = milesPerDegreeAt(point.lat);
  const latitudeMargin = radiusMi / milesPerLatitudeDegree;
  const longitudeMargin = radiusMi / milesPerLongitudeDegree;
  const found = [];
  const { order, latitudes } = timetable.byLatitude;
  for (let position = firstAtOrNorthOf(latitudes, point.lat - latitudeMargin); position < order.length && latitudes[position] <= point.lat + latitudeMargin; position++) {
    const stop = timetable.stops[order[position]];
    if (Math.abs(stop.lon - point.lon) > longitudeMargin) continue;
    const distanceMi = haversineMi(point, stop);
    if (distanceMi <= radiusMi) found.push({ stop, distanceMi });
  }
  return found;
}

function searchSignature(method, period) {
  const names = ['catchmentMi', 'shortestRideMi', 'minConnectionMin', 'transferWalkMi', 'walkMph', 'maxBusRides', 'departureStepMin', 'rushHourDeparturesMin', 'middayDeparturesMin'];
  return `${period}|${names.map((name) => param(method, name)).join(',')}`;
}

function departureWindow(method, period) {
  return param(method, period === 'peak' ? 'rushHourDeparturesMin' : 'middayDeparturesMin');
}

export function departureTimes(method, period) {
  const [windowStart, windowEnd] = departureWindow(method, period);
  const step = param(method, 'departureStepMin');
  const times = [];
  for (let leaveAt = windowStart; leaveAt < windowEnd; leaveAt += step) times.push(leaveAt);
  return times;
}

function firstTripLeavingAfter(pattern, position, readyAt) {
  const trips = pattern.tripTimes;
  let low = 0;
  let high = trips.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (trips[middle][position] < readyAt) low = middle + 1;
    else high = middle;
  }
  return low < trips.length ? low : -1;
}

function patternsToScan(readyToBoard, timetable) {
  const firstReadyPosition = new Map();
  for (const stopIndex of readyToBoard.keys()) {
    for (const { pattern, position } of timetable.visitsAtStop[stopIndex]) {
      const current = firstReadyPosition.get(pattern);
      if (current === undefined || position < current) firstReadyPosition.set(pattern, position);
    }
  }
  return firstReadyPosition;
}

const milesAlongByPattern = new WeakMap();

function milesAlong(pattern) {
  if (!milesAlongByPattern.has(pattern)) {
    let miles = 0;
    const atShapePoint = pattern.shape.map((point, index) => {
      if (index > 0) miles += haversineMi({ lon: pattern.shape[index - 1][0], lat: pattern.shape[index - 1][1] }, { lon: point[0], lat: point[1] });
      return miles;
    });
    milesAlongByPattern.set(pattern, pattern.stops.map((unused, position) => atShapePoint[pattern.shapeIndexAtStop[position]]));
  }
  return milesAlongByPattern.get(pattern);
}

function rideScannedRoutes(readyToBoard, earliestArrival, timetable, shortestRideMi) {
  const reachedByStop = new Map();
  for (const [pattern, startPosition] of patternsToScan(readyToBoard, timetable)) {
    let boarded = null;
    const miles = milesAlong(pattern);
    for (let position = startPosition; position < pattern.stops.length; position++) {
      const stopIndex = pattern.stops[position];
      if (boarded && miles[position] - miles[boarded.boardPosition] >= shortestRideMi) {
        const arrivesAt = pattern.tripTimes[boarded.tripIndex][position];
        if (arrivesAt < earliestArrival[stopIndex]) {
          earliestArrival[stopIndex] = arrivesAt;
          reachedByStop.set(stopIndex, { stopIndex, arrivesAt, pattern, tripIndex: boarded.tripIndex, boardPosition: boarded.boardPosition, boardedAfter: boarded.boardedAfter, alightPosition: position });
        }
      }
      const ready = readyToBoard.get(stopIndex);
      if (!ready || (boarded && ready.readyAt > pattern.tripTimes[boarded.tripIndex][position])) continue;
      const tripIndex = firstTripLeavingAfter(pattern, position, ready.readyAt);
      if (tripIndex === -1) continue;
      const catchesAnEarlierBus = !boarded || tripIndex < boarded.tripIndex;
      const catchesTheSameBusWithLessWalking = boarded && tripIndex === boarded.tripIndex && ready.readyAt < boarded.readyAt;
      if (catchesAnEarlierBus || catchesTheSameBusWithLessWalking) boarded = { tripIndex, boardPosition: position, readyAt: ready.readyAt, boardedAfter: ready.boardedAfter };
    }
  }
  return [...reachedByStop.values()];
}

function readyAfterChanging(reachedArrivals, footpaths, method) {
  const walkMph = param(method, 'walkMph');
  const minConnectionMin = param(method, 'minConnectionMin');
  const readyToBoard = new Map();
  for (const arrival of reachedArrivals) {
    for (const { stop, distanceMi } of footpaths[arrival.stopIndex]) {
      const walkMinutes = (distanceMi / walkMph) * 60;
      const readyAt = arrival.arrivesAt + walkMinutes + minConnectionMin;
      const current = readyToBoard.get(stop.index);
      if (!current || readyAt < current.readyAt) {
        readyToBoard.set(stop.index, { readyAt, boardedAfter: { changeFrom: arrival, toStop: stop, walkMiles: distanceMi, walkMinutes } });
      }
    }
  }
  return readyToBoard;
}

function searchLeavingAt(leaveAt, accessWalks, network, footpaths, method) {
  const { timetable } = network;
  const earliestArrival = new Float64Array(timetable.stops.length).fill(Infinity);
  const bestArrivalByStop = new Map();
  let readyToBoard = new Map();
  for (const access of accessWalks) {
    const readyAt = leaveAt + access.walk.minutes;
    const current = readyToBoard.get(access.stop.index);
    if (!current || readyAt < current.readyAt) readyToBoard.set(access.stop.index, { readyAt, boardedAfter: { access } });
  }
  for (let ridesSoFar = 0; ridesSoFar < param(method, 'maxBusRides') && readyToBoard.size > 0; ridesSoFar++) {
    const reached = rideScannedRoutes(readyToBoard, earliestArrival, timetable, param(method, 'shortestRideMi'));
    for (const arrival of reached) bestArrivalByStop.set(arrival.stopIndex, arrival);
    readyToBoard = readyAfterChanging(reached, footpaths, method);
  }
  return { leaveAt, bestArrivalByStop };
}

function searchFromOrigin(origin, network, method, period) {
  const { timetable, streets } = network;
  const accessWalks = stopsWithin(timetable, origin, param(method, 'catchmentMi'))
    .map(({ stop }) => ({ stop, walk: walkingLegFromStart(streets, origin, stop, method) }));
  const footpaths = footpathsFrom(timetable, param(method, 'transferWalkMi'));
  return departureTimes(method, period).map((leaveAt) => searchLeavingAt(leaveAt, accessWalks, network, footpaths, method));
}

const searchesByTimetable = new WeakMap();

function searchesFrom(origin, network, method, period) {
  if (!searchesByTimetable.has(network.timetable)) searchesByTimetable.set(network.timetable, new Map());
  const cache = searchesByTimetable.get(network.timetable);
  const key = `${origin.lat},${origin.lon}|${searchSignature(method, period)}`;
  if (cache.has(key)) return cache.get(key);
  const searches = searchFromOrigin(origin, network, method, period);
  cache.set(key, searches);
  if (cache.size > CACHED_ORIGINS) cache.delete(cache.keys().next().value);
  return searches;
}

function shapeBetween(pattern, boardPosition, alightPosition) {
  return pattern.shape.slice(pattern.shapeIndexAtStop[boardPosition], pattern.shapeIndexAtStop[alightPosition] + 1);
}

function lineMiles(line) {
  let miles = 0;
  for (let index = 1; index < line.length; index++) {
    miles += haversineMi({ lon: line[index - 1][0], lat: line[index - 1][1] }, { lon: line[index][0], lat: line[index][1] });
  }
  return miles;
}

function busLeavesAt(arrival) {
  return arrival.pattern.tripTimes[arrival.tripIndex][arrival.boardPosition];
}

function rideComponent(arrival, timetable, period) {
  const { pattern, boardPosition, alightPosition } = arrival;
  const path = shapeBetween(pattern, boardPosition, alightPosition);
  const departsAt = busLeavesAt(arrival);
  return {
    kind: 'ride',
    route: pattern.routeName,
    fromStop: timetable.stops[pattern.stops[boardPosition]].name,
    toStop: timetable.stops[pattern.stops[alightPosition]].name,
    minutes: arrival.arrivesAt - departsAt,
    departsAt,
    arrivesAt: arrival.arrivesAt,
    miles: lineMiles(path),
    period,
    path,
    stopsPassed: pattern.shapeIndexAtStop.slice(boardPosition + 1, alightPosition).map((shapeIndex) => pattern.shape[shapeIndex]),
    assumed: false,
    scheduled: true,
  };
}

function firstWaitMinutes(firstArrival, leaveAt) {
  return busLeavesAt(firstArrival) - (leaveAt + firstArrival.boardedAfter.access.walk.minutes);
}

function firstWaitOfWay(way) {
  const [firstArrival] = ridesInOrder(way.arrival);
  return firstWaitMinutes(firstArrival, way.leaveAt);
}

function waitComponent(firstArrival, leaveAt, period, firstWaitAcrossDepartures) {
  const { access } = firstArrival.boardedAfter;
  return {
    kind: 'wait',
    route: firstArrival.pattern.routeName,
    stopName: access.stop.name,
    minutes: firstWaitMinutes(firstArrival, leaveAt),
    busLeavesAt: busLeavesAt(firstArrival),
    waitAcrossDepartures: firstWaitAcrossDepartures,
    period,
    scheduled: true,
    assumed: false,
  };
}

function transferComponent(arrival, timetable, method) {
  const { changeFrom, toStop, walkMiles, walkMinutes } = arrival.boardedAfter;
  const busTime = busLeavesAt(arrival);
  return {
    kind: 'transfer',
    place: toStop.name,
    fromStop: timetable.stops[changeFrom.stopIndex].name,
    toRoute: arrival.pattern.routeName,
    minutes: busTime - changeFrom.arrivesAt,
    busLeavesAt: busTime,
    minConnectionMin: param(method, 'minConnectionMin'),
    walkMiles,
    walkMinutes,
    assumed: false,
  };
}

function ridesInOrder(finalArrival) {
  const arrivals = [];
  for (let arrival = finalArrival; arrival; arrival = arrival.boardedAfter.changeFrom ?? null) arrivals.unshift(arrival);
  return arrivals;
}

function legFor(way, origin, destination, departures, timetable, period, method) {
  const arrivals = ridesInOrder(way.arrival);
  const [firstArrival] = arrivals;
  const { access } = firstArrival.boardedAfter;
  const components = [
    { kind: 'walk-to-stop', route: firstArrival.pattern.routeName, stopName: access.stop.name, ...access.walk },
    waitComponent(firstArrival, way.leaveAt, period, departures.firstWaitMin),
  ];
  const pathPoints = [origin, access.stop];
  for (const arrival of arrivals) {
    if (arrival.boardedAfter.changeFrom) {
      components.push(transferComponent(arrival, timetable, method));
      pathPoints.push(timetable.stops[arrival.boardedAfter.changeFrom.stopIndex], arrival.boardedAfter.toStop);
    }
    components.push(rideComponent(arrival, timetable, period));
  }
  components.push({ kind: 'walk-to-destination', stopName: way.alightingStop.name, ...way.walkToDestination });
  pathPoints.push(way.alightingStop, destination);
  return {
    fields: {
      mode: 'transit',
      kind: arrivals.length > 1 ? 'transfer' : 'direct',
      transferCount: arrivals.length - 1,
      routes: arrivals.map((arrival) => arrival.pattern.routeName),
      path: pathPoints.map((point) => ({ lat: point.lat, lon: point.lon })),
      leavesAt: way.leaveAt,
      departures,
    },
    components,
  };
}

function servesStopDuring(pattern, position, [windowStart, windowEnd]) {
  return pattern.tripTimes.some((times) => times[position] >= windowStart && times[position] < windowEnd);
}

function hasServiceNear(timetable, stopsNearby, window) {
  return stopsNearby.some(({ stop }) => timetable.visitsAtStop[stop.index].some(({ pattern, position }) => servesStopDuring(pattern, position, window)));
}

function noBusTripReason(origin, destination, network, method, period) {
  const { timetable } = network;
  const catchmentMi = param(method, 'catchmentMi');
  const window = departureWindow(method, period);
  const stopsNearStart = stopsWithin(timetable, origin, catchmentMi);
  const stopsNearDestination = stopsWithin(timetable, destination, catchmentMi);
  if (stopsNearStart.length === 0) return 'no-stop-near-start';
  if (stopsNearDestination.length === 0) return 'no-stop-near-destination';
  if (!hasServiceNear(timetable, stopsNearStart, window)) return 'no-service-near-start';
  if (!hasServiceNear(timetable, stopsNearDestination, window)) return 'no-service-near-destination';
  return 'not-connected';
}

function fastestWayLeavingAt(search, ways) {
  let fastest = null;
  for (const { stop, walkToDestination } of ways) {
    const arrival = search.bestArrivalByStop.get(stop.index);
    if (!arrival) continue;
    const totalMinutes = arrival.arrivesAt + walkToDestination.minutes - search.leaveAt;
    if (!fastest || totalMinutes < fastest.totalMinutes) fastest = { leaveAt: search.leaveAt, totalMinutes, arrival, alightingStop: stop, walkToDestination };
  }
  return fastest;
}

function firstWaitRange(ways) {
  const firstWaits = ways.map(firstWaitOfWay);
  return { fewest: Math.min(...firstWaits), most: Math.max(...firstWaits) };
}

function waitAtTransfer(arrival) {
  const { changeFrom, walkMinutes } = arrival.boardedAfter;
  return busLeavesAt(arrival) - changeFrom.arrivesAt - walkMinutes;
}

function waitingOfWay(way) {
  const transferWaits = ridesInOrder(way.arrival).filter((arrival) => arrival.boardedAfter.changeFrom).map(waitAtTransfer);
  return transferWaits.reduce((sum, minutes) => sum + minutes, firstWaitOfWay(way));
}

function waitingRange(ways) {
  const waits = ways.map(waitingOfWay);
  return { fewest: Math.min(...waits), most: Math.max(...waits) };
}

export function typicalOf(sortedWays) {
  return sortedWays[Math.trunc((sortedWays.length - 1) / 2)];
}

export function fastestTimetableBusLeg(origin, destination, network, method, period) {
  const searches = searchesFrom(origin, network, method, period);
  const waysToTheDoor = stopsWithin(network.timetable, destination, param(method, 'catchmentMi'))
    .map(({ stop }) => ({ stop, walkToDestination: walkingLegToEnd(network.streets, stop, destination, method) }));
  const ways = searches.map((search) => fastestWayLeavingAt(search, waysToTheDoor)).filter(Boolean);
  if (ways.length === 0) return { noTrip: noBusTripReason(origin, destination, network, method, period) };
  const sortedWays = [...ways].sort((quicker, slower) => quicker.totalMinutes - slower.totalMinutes || quicker.leaveAt - slower.leaveAt);
  const departures = {
    tried: searches.length,
    withATrip: ways.length,
    bestMin: sortedWays[0].totalMinutes,
    worstMin: sortedWays[sortedWays.length - 1].totalMinutes,
    window: departureWindow(method, period),
    stepMin: param(method, 'departureStepMin'),
    firstWaitMin: firstWaitRange(ways),
    waitingMin: waitingRange(ways),
  };
  return { found: legFor(typicalOf(sortedWays), origin, destination, departures, network.timetable, period, method) };
}

const accessWalksByTimetable = new WeakMap();

function accessWalksFrom(origin, network, method) {
  if (!accessWalksByTimetable.has(network.timetable)) accessWalksByTimetable.set(network.timetable, new Map());
  const cache = accessWalksByTimetable.get(network.timetable);
  const key = `${origin.lat},${origin.lon}|${param(method, 'catchmentMi')}`;
  if (!cache.has(key)) {
    cache.set(key, stopsWithin(network.timetable, origin, param(method, 'catchmentMi')).map(({ stop }) => ({ stop, walk: walkingLegFromStart(network.streets, origin, stop, method) })));
    if (cache.size > CACHED_ORIGINS) cache.delete(cache.keys().next().value);
  }
  return cache.get(key);
}

export function timetableBusLegLeavingAt(origin, destination, network, method, { leaveAt, period }) {
  const footpaths = footpathsFrom(network.timetable, param(method, 'transferWalkMi'));
  const search = searchLeavingAt(leaveAt, accessWalksFrom(origin, network, method), network, footpaths, method);
  const waysToTheDoor = stopsWithin(network.timetable, destination, param(method, 'catchmentMi'))
    .map(({ stop }) => ({ stop, walkToDestination: walkingLegToEnd(network.streets, stop, destination, method) }));
  const way = fastestWayLeavingAt(search, waysToTheDoor);
  if (!way) return { noTrip: noBusTripReason(origin, destination, network, method, period) };
  const departures = {
    tried: 1,
    withATrip: 1,
    bestMin: way.totalMinutes,
    worstMin: way.totalMinutes,
    window: [leaveAt, leaveAt],
    stepMin: 0,
    firstWaitMin: firstWaitRange([way]),
    waitingMin: waitingRange([way]),
  };
  return { found: legFor(way, origin, destination, departures, network.timetable, period, method) };
}
