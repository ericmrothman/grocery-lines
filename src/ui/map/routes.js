import { routeLineWords } from '../../language.js';

const DRAWN_MODE_BY_COMPONENT_KIND = Object.freeze({ drive: 'car', 'walk-to-stop': 'walk', 'walk-to-destination': 'walk', 'walk-whole-way': 'walk', ride: 'bus' });

const LEG_DRAWN_FOR = Object.freeze({
  car: (trip) => trip.drive,
  bus: (trip) => trip.transit,
  'walk-whole-way': (trip) => (trip.transit.kind === 'walk' ? null : trip.walk),
});

export function routeLines(trip, mode) {
  const leg = LEG_DRAWN_FOR[mode](trip);
  if (!leg) return [];
  const isOtherWay = mode === 'walk-whole-way';
  const tripItBelongsTo = { car: 'car', bus: trip.transit.kind === 'walk' ? 'walk' : 'bus', 'walk-whole-way': 'walk' }[mode];
  const legMiles = leg.components.reduce((sum, component) => sum + (component.miles ?? 0), 0);
  return leg.components
    .filter((component) => component.path && DRAWN_MODE_BY_COMPONENT_KIND[component.kind])
    .map((component) => {
      const drawnLine = { mode: DRAWN_MODE_BY_COMPONENT_KIND[component.kind], trip: tripItBelongsTo, kind: component.kind, route: component.route ?? null, minutes: component.minutes, miles: component.miles ?? 0, legMiles, assumed: component.assumed === true, isOtherWay, line: component.path };
      return { ...drawnLine, label: routeLineWords(drawnLine) };
    });
}

function busStops(trip) {
  if (trip.transit.kind === 'walk') return [];
  return trip.transit.path.slice(1, -1).map((point) => ({ lat: point.lat, lon: point.lon }));
}

function stopsPassed(trip) {
  if (trip.transit.kind === 'walk') return [];
  return trip.transit.components.filter((component) => component.kind === 'ride').flatMap((ride) => ride.stopsPassed.map(([lon, lat]) => ({ lat, lon })));
}

export function tripDrawnGeometry(trip) {
  return {
    lines: [...routeLines(trip, 'walk-whole-way'), ...routeLines(trip, 'car'), ...routeLines(trip, 'bus')],
    busStops: busStops(trip),
    stopsPassed: stopsPassed(trip),
  };
}
