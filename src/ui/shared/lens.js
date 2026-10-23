import { param } from '../../method.js';
import { wholeMinutes } from '../../rounding.js';

export const MAP_LENSES = Object.freeze(['bus', 'walk', 'car']);

function fastestOverKinds(cell, kinds, minutesOf) {
  return Math.min(...kinds.map((kind) => minutesOf(cell.layers[kind]) ?? Infinity));
}

export function lensValueForCell(cell, { kinds, lens, period }) {
  if (!cell.layers) return null;
  if (lens === 'bus') return fastestOverKinds(cell, kinds, (layer) => layer.transit[period]?.minutes);
  if (lens === 'walk') return fastestOverKinds(cell, kinds, (layer) => layer.walk?.minutes);
  if (lens === 'car') return fastestOverKinds(cell, kinds, (layer) => layer.car.minutes);
  throw new Error(`Unknown map lens: ${lens}`);
}

const TRIP_OF_LENS = Object.freeze({
  bus: (layer, period) => layer.transit[period],
  walk: (layer) => layer.walk,
  car: (layer) => layer.car,
});

export function nearestPlaceIdForCell(cell, { mapMode, period }, kind = 'supermarket') {
  const tripOf = TRIP_OF_LENS[mapMode];
  if (!tripOf) throw new Error(`Unknown map lens: ${mapMode}`);
  const layer = cell.layers?.[kind];
  if (!layer) return null;
  return (tripOf(layer, period) ?? layer.car)?.placeId ?? null;
}

export function lensBins(lens, method, lineMin = param(method, 'desertTransitMin')) {
  return { upperBounds: lineMin < 40 ? [10, lineMin, 40, 60] : [10, param(method, 'desertTransitMin'), lineMin, 60] };
}

export function binIndex(value, upperBounds) {
  const index = upperBounds.findIndex((upperBound) => value < upperBound);
  return index === -1 ? upperBounds.length : index;
}

export const FINDINGS_PERIOD = 'peak';
export const FOOD_KINDS = Object.freeze(['supermarket', 'pantry', 'other-retailer']);

const OVER_CARLESS_LINE_UPPER_BOUNDS = Object.freeze([20, 25, 35, 45]);

export function carlessBins(method, overLineOnly = false) {
  if (overLineOnly) return { upperBounds: OVER_CARLESS_LINE_UPPER_BOUNDS, lowerBound: param(method, 'desertCarlessPct') };
  return { upperBounds: [5, 10, param(method, 'desertCarlessPct'), 25] };
}

export function isOverCarlessLine(carlessPct, method) {
  return carlessPct !== null && carlessPct > param(method, 'desertCarlessPct');
}

export function tripSettings(view, { kinds, mapMode, period }) {
  return view.lockedTrip ?? { kinds, mapMode, period };
}

export function surfaceBins(view, mapMode, method, lineMin = param(method, 'desertTransitMin')) {
  if (view.colorBy === 'carless') return carlessBins(method, view.onlyCarless);
  if (view.colorBy === 'pastLine' || view.colorBy === 'plain') return null;
  return lensBins(mapMode, method, lineMin);
}

export function isPastLine(cell, method, lineMin = param(method, 'desertTransitMin'), period = FINDINGS_PERIOD) {
  return wholeMinutes(lensValueForCell(cell, { kinds: ['supermarket'], lens: 'bus', period })) >= lineMin;
}

export function surfaceValueForCell(cell, { view, kinds, mapMode, period, carlessPctOf, method, lineMin = param(method, 'desertTransitMin') }) {
  if (!view.hexagons) return null;
  if (view.onlyPastLine && !isPastLine(cell, method, lineMin, period)) return null;
  if (view.onlyCarless && !isOverCarlessLine(carlessPctOf(cell.geoid) ?? null, method)) return null;
  if (view.onlyLivedIn && !cell.populated) return null;
  if (view.colorBy === 'pastLine' || view.colorBy === 'plain') return 1;
  if (view.colorBy === 'carless') return carlessPctOf(cell.geoid) ?? null;
  if (kinds.length === 0) return null;
  return wholeMinutes(lensValueForCell(cell, { kinds, lens: mapMode, period }));
}
