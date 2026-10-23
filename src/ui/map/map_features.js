import { darkerShade } from './color.js';

export const NO_FEATURES = Object.freeze({ type: 'FeatureCollection', features: Object.freeze([]) });

function closedRing(corners) {
  return [...corners, corners[0]];
}

export function linesFeatures(lines) {
  if (lines.length === 0) return NO_FEATURES;
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: lines } }] };
}

export function busNetworkFeatures(routes) {
  return { type: 'FeatureCollection', features: routes.map((route, index) => ({ type: 'Feature', id: index, properties: { color: route.color ?? null }, geometry: { type: 'MultiLineString', coordinates: route.parts } })) };
}

export function highNeedFeatures(outline) {
  const polygons = outline?.polygons ?? [];
  if (polygons.length === 0) return NO_FEATURES;
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polygons } }] };
}

export function lilaTractFeatures(tracts) {
  if (!tracts || tracts.length === 0) return NO_FEATURES;
  return { type: 'FeatureCollection', features: tracts.map(({ tract, geometry }) => ({ type: 'Feature', properties: { tract }, geometry })) };
}

export function startCellFeatures(corners, { fill, fallbackColor, edgeShade, widthPx = null }) {
  if (!corners) return NO_FEATURES;
  const color = (fill && darkerShade(fill, edgeShade)) ?? fallbackColor;
  const properties = widthPx === null ? { color } : { color, widthPx };
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties, geometry: { type: 'Polygon', coordinates: [closedRing(corners)] } }] };
}
