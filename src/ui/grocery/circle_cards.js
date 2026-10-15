import { estimateTrip } from '../../mobility.js';
import { haversineMi } from '../../geo.js';
import { routeLines } from '../map/routes.js';

export const CIRCLE_HOME_RULE = Object.freeze({ nearestMiles: 0.7, farthestMiles: 1, period: 'peak' });

const MILES_PER_DEGREE_LATITUDE = 69;

function roundedMiles(miles) {
  return Number(miles.toFixed(4));
}

function milesFromStore(store) {
  const milesPerDegreeLongitude = MILES_PER_DEGREE_LATITUDE * Math.cos((store.lat * Math.PI) / 180);
  return ([lon, lat]) => [roundedMiles((lon - store.lon) * milesPerDegreeLongitude), roundedMiles((store.lat - lat) * MILES_PER_DEGREE_LATITUDE)];
}

export function circleHomeFor(supermarket, populatedCells, rule = CIRCLE_HOME_RULE) {
  const rimCells = populatedCells.filter((cell) => {
    const miles = haversineMi(cell, supermarket);
    return miles >= rule.nearestMiles && miles <= rule.farthestMiles;
  });
  return rimCells.reduce((mostLivedIn, cell) => (mostLivedIn === null || cell.households > mostLivedIn.households ? cell : mostLivedIn), null);
}

function transferWalks(busLeg) {
  const rides = busLeg.components.filter((component) => component.kind === 'ride');
  return rides.slice(1).map((ride, index) => [rides[index].path.at(-1), ride.path[0]]);
}

function busLines(trip, busLeg, toMiles) {
  if (!busLeg) return [];
  const drawnLines = routeLines({ ...trip, transit: busLeg }, 'bus').map((drawnLine) => ({ by: drawnLine.mode === 'bus' ? 'bus' : 'foot-to-bus', points: drawnLine.line.map(toMiles) }));
  const transfers = transferWalks(busLeg).map((ends) => ({ by: 'foot-to-bus', points: ends.map(toMiles) }));
  return [...drawnLines, ...transfers];
}

export function circleCardFor(supermarket, home, { network, method }) {
  const trip = estimateTrip({ lat: home.lat, lon: home.lon, source: 'map-point' }, supermarket, network, method, { period: CIRCLE_HOME_RULE.period });
  const toMiles = milesFromStore(supermarket);
  const busLeg = trip.bus && trip.bus.kind !== 'walk' ? trip.bus : null;
  const walkingPaths = trip.walk ? trip.walk.components.filter((component) => component.path).map((component) => component.path) : [];
  return {
    placeId: supermarket.id,
    name: supermarket.name.replace(/\s*#\s*\d+$/, '').trim(),
    homeCellId: home.id,
    homeMiles: Number(haversineMi(home, supermarket).toFixed(2)),
    home: toMiles([home.lon, home.lat]),
    minutes: {
      car: trip.drive.totalMin,
      walk: trip.walk ? trip.walk.totalMin : null,
      bus: busLeg ? busLeg.totalMin : null,
    },
    busRoutes: busLeg ? busLeg.routes : [],
    lines: [
      ...routeLines(trip, 'car').map((drawnLine) => ({ by: 'car', points: drawnLine.line.map(toMiles) })),
      ...busLines(trip, busLeg, toMiles),
      ...walkingPaths.map((path) => ({ by: 'walk', points: path.map(toMiles) })),
    ],
  };
}

export function circleCardsFor(supermarkets, populatedCells, { network, method }) {
  return supermarkets.flatMap((supermarket) => {
    const home = circleHomeFor(supermarket, populatedCells);
    return home ? [circleCardFor(supermarket, home, { network, method })] : [];
  });
}
