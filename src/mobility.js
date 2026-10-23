import { param } from './method.js';
import { haversineMi } from './geo.js';
import { drivingLeg, walkingLegFromStart } from './street_legs.js';
import { fastestTimetableBusLeg, timetableBusLegLeavingAt } from './transit.js';

function legFromComponents(fields, components) {
  const totalMin = components.reduce((sum, component) => sum + component.minutes, 0);
  return Object.freeze({
    ...fields,
    components: Object.freeze(components.map((component) => Object.freeze(component))),
    totalMin,
  });
}

function requireStreets(network) {
  if (!network?.streets) throw new Error('network.streets is required: car and walking legs follow the street network');
  return network.streets;
}

function walkFromOriginComponent(kind, from, to, network, method) {
  return { kind, ...walkingLegFromStart(requireStreets(network), from, to, method) };
}

export function estimateDrive(origin, destination, network, method) {
  const driveComponent = { kind: 'drive', ...drivingLeg(requireStreets(network), origin, destination, method) };
  const parkComponent = { kind: 'park', minutes: param(method, 'parkingMin'), assumed: false };
  return legFromComponents({ mode: 'drive', distanceMi: driveComponent.miles }, [driveComponent, parkComponent]);
}

function walkOnlyLeg(origin, destination, network, method, reasonFields) {
  const fields = { mode: 'transit', kind: 'walk', routes: [], path: [origin, destination], ...reasonFields };
  return legFromComponents(fields, [walkFromOriginComponent('walk-whole-way', origin, destination, network, method)]);
}

const TIME_PART_BY_COMPONENT_KIND = Object.freeze({
  'walk-to-stop': 'walk',
  'walk-to-destination': 'walk',
  'walk-whole-way': 'walk',
  wait: 'wait',
  ride: 'ride',
  drive: 'drive',
  park: 'park',
});

function transferPieces(transfer) {
  const walkBetweenStops = { part: 'walk', minutes: transfer.walkMinutes, component: transfer, route: null };
  const waitForTheNextBus = { part: 'wait', minutes: transfer.minutes - transfer.walkMinutes, component: transfer, route: transfer.toRoute };
  return [walkBetweenStops, waitForTheNextBus].filter((piece) => piece.minutes > 0);
}

export function timePieces(leg) {
  return leg.components.flatMap((component) => {
    if (component.kind === 'transfer') return transferPieces(component);
    const part = TIME_PART_BY_COMPONENT_KIND[component.kind];
    if (!part) throw new Error(`No time part for component kind: ${component.kind}`);
    const route = component.kind === 'ride' || component.kind === 'wait' ? component.route : null;
    return [{ part, minutes: component.minutes, component, route }];
  });
}

export function estimateWalk(origin, destination, network, method) {
  return walkOnlyLeg(origin, destination, network, method, {});
}

function fastestBusLeg(origin, destination, network, method, period) {
  if (!network.timetable) throw new Error('network.timetable is required: bus trips follow the GTFS timetable');
  const timetableLeg = fastestTimetableBusLeg(origin, destination, network, method, period);
  return timetableLeg.found ? { found: legFromComponents(timetableLeg.found.fields, timetableLeg.found.components) } : timetableLeg;
}

function noBusTripLeg(origin, destination, reasonFields) {
  return Object.freeze({ mode: 'transit', kind: 'none', routes: [], path: [origin, destination], ...reasonFields, components: Object.freeze([]), totalMin: null });
}

function walkingDistanceMi(walkLeg) {
  return walkLeg.components[0].miles;
}

function transitChoices(origin, destination, network, method, period) {
  const bus = fastestBusLeg(origin, destination, network, method, period);
  const reasonFields = { walkReason: bus.found ? 'walking-is-faster' : bus.noTrip, catchmentMi: param(method, 'catchmentMi'), period };
  const walking = walkOnlyLeg(origin, destination, network, method, reasonFields);
  return { chosen: chosenTransit(bus.found ?? null, walking, method, () => noBusTripLeg(origin, destination, reasonFields)), bus: bus.found ?? null, walk: walking };
}

function chosenTransit(bus, walking, method, noTrip) {
  const walkingIsWithinLimit = walkingDistanceMi(walking) <= param(method, 'maxWalkMi');
  if (bus) return walkingIsWithinLimit && walking.totalMin <= bus.totalMin ? walking : bus;
  return walkingIsWithinLimit ? walking : noTrip();
}

function tripWithBus(trip, bus, method) {
  if (!bus) return trip;
  const transit = chosenTransit(bus, trip.walk, method, () => trip.transit);
  return Object.freeze({ ...trip, bus, transit, disparity: disparity(trip.drive, transit, method) });
}

export function periodAt(leaveAt, method) {
  const within = ([fromMin, toMin]) => leaveAt >= fromMin && leaveAt <= toMin;
  if (within(param(method, 'rushHourDeparturesMin'))) return 'peak';
  if (within(param(method, 'middayDeparturesMin'))) return 'offPeak';
  return null;
}

export function tripTimedToTheBus(trip, network, method) {
  const [walkToStop, firstWait] = trip.bus?.components ?? [];
  if (firstWait?.kind !== 'wait') return trip;
  const { origin, destination, period } = trip.inputs;
  return tripWithBus(trip, busLegLeavingAt(origin, destination, network, method, { leaveAt: firstWait.busLeavesAt - walkToStop.minutes, period }), method);
}

export function tripLeavingAt(trip, network, method, leaveAt) {
  const { origin, destination, period } = trip.inputs;
  return tripWithBus(trip, busLegLeavingAt(origin, destination, network, method, { leaveAt, period }), method);
}

export function busLegLeavingAt(origin, destination, network, method, { leaveAt, period = 'offPeak' }) {
  if (!network.timetable) throw new Error('network.timetable is required: bus trips follow the GTFS timetable');
  const timetableLeg = timetableBusLegLeavingAt(origin, destination, network, method, { leaveAt, period });
  return timetableLeg.found ? legFromComponents(timetableLeg.found.fields, timetableLeg.found.components) : null;
}

export function estimateTransit(origin, destination, network, method, period = 'peak') {
  return transitChoices(origin, destination, network, method, period).chosen;
}

export function rankingMinutes(transitLeg) {
  return transitLeg.totalMin ?? Infinity;
}

export function disparityOfMinutes(driveMinutes, transitMinutes, method) {
  if (transitMinutes === null) return Object.freeze({ ratio: null, gapMin: null, band: 'no-bus-trip' });
  const ratio = transitMinutes / driveMinutes;
  let band;
  if (driveMinutes < param(method, 'shortTripDriveMin')) band = 'short-trip';
  else if (ratio >= param(method, 'severeRatio')) band = 'severe';
  else if (ratio >= param(method, 'strainedRatio')) band = 'strained';
  else band = 'parity';
  return Object.freeze({ ratio, gapMin: transitMinutes - driveMinutes, band });
}

export function disparity(drive, transit, method) {
  return disparityOfMinutes(drive.totalMin, transit.totalMin, method);
}

export function estimateTrip(origin, destination, network, method, { period = 'peak' } = {}) {
  if (!origin?.source) throw new Error('origin.source is required (gps, search, zip or default)');
  if (!network?.snapshotId) throw new Error('network.snapshotId is required');
  const drive = estimateDrive(origin, destination, network, method);
  const { chosen: transit, bus, walk } = transitChoices(origin, destination, network, method, period);
  return Object.freeze({
    inputs: Object.freeze({ origin, destination, period }),
    drive,
    transit,
    bus,
    walk,
    disparity: disparity(drive, transit, method),
    methodVersion: method.version,
    snapshotId: network.snapshotId,
    streetsSnapshotId: network.streets.snapshotId,
    timetableSnapshotId: network.timetable?.snapshotId ?? null,
  });
}

const MINUTES_RANKED_BY = Object.freeze({
  bus: (trip) => rankingMinutes(trip.transit),
  car: (trip) => trip.drive.totalMin,
  walk: (trip) => trip.walk.totalMin,
});

export function tripRankingMinutes(trip, rankedBy) {
  const minutesOf = MINUTES_RANKED_BY[rankedBy];
  if (!minutesOf) throw new Error(`Unknown ranking: ${rankedBy}`);
  return minutesOf(trip);
}

function fastestPossibleMph(network, method, rankedBy) {
  if (rankedBy === 'car') return param(method, 'motorwayMph');
  if (rankedBy === 'walk') return param(method, 'walkMph');
  return Math.max(param(method, 'walkMph'), network.timetable.fastestStraightLineMph);
}

function insertFastestFirst(fastest, entry, count, rankedBy) {
  const entryMinutes = tripRankingMinutes(entry.trip, rankedBy);
  const position = fastest.findIndex((existing) => entryMinutes < tripRankingMinutes(existing.trip, rankedBy)
    || (entryMinutes === tripRankingMinutes(existing.trip, rankedBy) && entry.order < existing.order));
  fastest.splice(position === -1 ? fastest.length : position, 0, entry);
  if (fastest.length > count) fastest.pop();
}

export function fastestTrips(origin, destinations, network, method, { period = 'peak', count = 3, rankedBy = 'bus' } = {}) {
  const fastestMph = fastestPossibleMph(network, method, rankedBy);
  const lowerBoundMin = (straightLineMiles) => (straightLineMiles / fastestMph) * 60;
  const candidates = destinations
    .map((destination, order) => ({ destination, order, lowerBoundMin: lowerBoundMin(haversineMi(origin, destination)) }))
    .sort((nearer, farther) => nearer.lowerBoundMin - farther.lowerBoundMin || nearer.order - farther.order);
  const fastest = [];
  for (const candidate of candidates) {
    if (fastest.length >= count && candidate.lowerBoundMin > tripRankingMinutes(fastest[fastest.length - 1].trip, rankedBy)) break;
    insertFastestFirst(fastest, { order: candidate.order, trip: estimateTrip(origin, candidate.destination, network, method, { period }) }, count, rankedBy);
  }
  return fastest.map(({ trip }) => trip);
}
