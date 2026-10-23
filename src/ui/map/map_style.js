import { layers as protomapsLayers, namedFlavor } from '../../../vendor/protomaps-basemaps-5.7.2/basemaps.js';
import { BASEMAP_FLAVORS, BASEMAP_FONTS, groundColor, paletteFor } from './map_theme.js';
import { NO_FEATURES } from './map_features.js';

export const FOOD_SOURCE_IDS = Object.freeze(['county', 'lila-tracts', 'bus-network', 'high-need', 'start-cell']);
export const SURFACE_LAYER_ID = 'food-surface';

function withoutIcons(layout) {
  return Object.fromEntries(Object.entries(layout).filter(([property]) => !property.startsWith('icon-')));
}

function scaledZoomCurve(value, scale) {
  if (typeof value === 'number') return value * scale;
  const isZoomCurve = Array.isArray(value) && value[0] === 'interpolate' && Array.isArray(value[2]) && value[2][0] === 'zoom';
  if (!isZoomCurve) return value;
  return [...value.slice(0, 3), ...value.slice(3).map((stop, index) => (index % 2 === 1 && typeof stop === 'number' ? stop * scale : stop))];
}

function isRoad(layer) {
  return layer.id.startsWith('roads_') && layer.type === 'line';
}

function isMajorRoad(layer) {
  return /highway|major/.test(layer.id);
}

const OPACITY_KEYS = Object.freeze({ line: ['line-opacity'], fill: ['fill-opacity'], 'fill-extrusion': ['fill-extrusion-opacity'], circle: ['circle-opacity'], symbol: ['text-opacity', 'icon-opacity'], raster: ['raster-opacity'] });

function keepsBasemapLayer(layer, palette) {
  return !(palette.roadColor && isRoad(layer) && layer.id.includes('casing'));
}

function showsBasemapLayer(layer, basemap) {
  if (layer.type === 'symbol') return basemap.labels;
  if (layer.id.startsWith('landuse_')) return basemap.landuse;
  if (layer.id.startsWith('water')) return basemap.water;
  if (layer.id === 'buildings') return basemap.buildings;
  if (!isRoad(layer)) return true;
  if (basemap.roads === 'none') return false;
  return basemap.roads === 'all' || isMajorRoad(layer);
}

function shownOrFaded(layer, isShown) {
  const keys = OPACITY_KEYS[layer.type] ?? [];
  if (keys.length === 0) return layer;
  const opacities = Object.fromEntries(keys.map((key) => [key, isShown ? layer.paint?.[key] ?? 1 : 0]));
  return { ...layer, paint: { ...layer.paint, ...opacities }, ...(isShown ? {} : { metadata: { ...layer.metadata, faded: true } }) };
}

function restyledLabel(layer, basemap, palette) {
  return { ...layer, paint: { ...layer.paint, 'text-halo-width': basemap.labelHaloPx, ...(palette.labelHalo ? { 'text-halo-color': palette.labelHalo } : {}) } };
}

function restyledBasemapLayer(layer, basemap, palette) {
  if (layer.type === 'symbol') return restyledLabel(layer, basemap, palette);
  if (palette.ground && layer.id === 'background') return { ...layer, paint: { ...layer.paint, 'background-color': palette.ground } };
  if (palette.ground && layer.id === 'earth') return { ...layer, paint: { ...layer.paint, 'fill-color': palette.ground } };
  if (!isRoad(layer)) return layer;
  const paint = { ...layer.paint, 'line-width': scaledZoomCurve(layer.paint?.['line-width'] ?? 1, basemap.roadWidthScale) };
  if (palette.roadColor) Object.assign(paint, { 'line-color': palette.roadColor, 'line-opacity': basemap.roadOpacity });
  return { ...layer, paint };
}

function canSitAboveCells(layer) {
  return isRoad(layer) && isMajorRoad(layer) && !layer.id.includes('tunnels') && !layer.id.includes('casing');
}

function placedAndShown(layer, basemap) {
  const isShown = showsBasemapLayer(layer, basemap);
  if (!canSitAboveCells(layer)) return [shownOrFaded(layer, isShown)];
  const aboveCells = { ...layer, id: `${layer.id}-above-cells`, metadata: { ...layer.metadata, aboveCells: true } };
  return [shownOrFaded(layer, isShown && !basemap.roadsAboveCells), shownOrFaded(aboveCells, isShown && basemap.roadsAboveCells)];
}

export function basemapLayers(definition, scheme) {
  const palette = paletteFor(definition, scheme);
  const basemap = definition.basemap;
  const flavor = BASEMAP_FLAVORS.includes(palette.basemap) ? palette.basemap : 'light';
  return protomapsLayers('basemap', { ...namedFlavor(flavor), ...basemapFontFaces(basemap.font) }, { lang: 'en' })
    .filter((layer) => !layer.layout?.['icon-image'] || layer.layout['text-field'])
    .map((layer) => (layer.layout?.['icon-image'] ? { ...layer, layout: withoutIcons(layer.layout) } : layer))
    .filter((layer) => keepsBasemapLayer(layer, palette))
    .flatMap((layer) => placedAndShown(restyledBasemapLayer(layer, basemap, palette), basemap));
}

export function basemapFontFaces(font = BASEMAP_FONTS[0]) {
  return { regular: `${font} Regular`, bold: `${font} Medium`, italic: `${font} Italic` };
}

function lilaTractFill(palette) {
  return { id: 'lila-tracts-fill', type: 'fill', source: 'lila-tracts', paint: { 'fill-color': palette.lila, 'fill-opacity': 0 } };
}

function foodLayers(definition, palette) {
  const lines = definition.lines;
  const busColor = lines.busNetworkColors === 'agency' ? ['coalesce', ['get', 'color'], palette.busNetwork] : palette.busNetwork;
  return [
    {
      id: 'food-county',
      type: 'line',
      source: 'county',
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': palette.countyLine, 'line-width': lines.countyPx },
    },
    {
      id: 'food-lila-tracts-line',
      type: 'line',
      source: 'lila-tracts',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': palette.lila, 'line-width': lines.lila.lineWidthPx, 'line-opacity': 0 },
    },
    {
      id: 'food-bus-network',
      type: 'line',
      source: 'bus-network',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': busColor, 'line-width': lines.busNetworkPx, 'line-opacity': ['*', lines.busNetworkOpacity, ['coalesce', ['feature-state', 'share'], 0]] },
    },
    {
      id: 'food-high-need-casing',
      type: 'line',
      source: 'high-need',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': palette.highNeedCasing, 'line-width': lines.highNeed.casingWidthPx },
    },
    {
      id: 'food-high-need-line',
      type: 'line',
      source: 'high-need',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': palette.highNeed, 'line-width': lines.highNeed.lineWidthPx },
    },
    {
      id: 'food-start-cell',
      type: 'line',
      source: 'start-cell',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': ['coalesce', ['get', 'widthPx'], lines.startCellPx] },
    },
  ];
}

export function compileMapStyle({ definition, scheme, basemap, transitionMs = 0 }) {
  const palette = paletteFor(definition, scheme);
  const base = basemap ? basemapLayers(definition, scheme) : [];
  const isLabel = (layer) => layer.type === 'symbol';
  const isAboveCells = (layer) => layer.metadata?.aboveCells === true;
  const sources = Object.fromEntries(FOOD_SOURCE_IDS.map((id) => [id, { type: 'geojson', data: NO_FEATURES }]));
  if (basemap) sources.basemap = { type: 'vector', url: basemap.url, attribution: basemap.attribution };
  return {
    version: 8,
    transition: { duration: transitionMs, delay: 0 },
    ...(basemap ? { glyphs: basemap.glyphs } : {}),
    sources,
    layers: [
      ...(basemap ? [] : [{ id: 'background', type: 'background', paint: { 'background-color': groundColor(definition, scheme) } }]),
      ...base.filter((layer) => !isLabel(layer) && !isAboveCells(layer)),
      lilaTractFill(palette),
      ...base.filter(isAboveCells),
      ...foodLayers(definition, palette),
      ...base.filter(isLabel),
    ],
  };
}

function sameJson(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function propertyChanges(layerId, kind, from = {}, to = {}) {
  return [...new Set([...Object.keys(from), ...Object.keys(to)])]
    .filter((property) => !sameJson(from[property], to[property]))
    .map((property) => ({ layerId, kind, property, value: to[property] }));
}

export function styleChanges(fromStyle, toStyle) {
  const layerIds = (style) => style.layers.map((layer) => `${layer.id}:${layer.type}:${layer.source ?? ''}:${layer['source-layer'] ?? ''}`);
  const keepsShape = sameJson(layerIds(fromStyle), layerIds(toStyle)) && sameJson(fromStyle.sources, toStyle.sources) && fromStyle.glyphs === toStyle.glyphs
    && toStyle.layers.every((layer, index) => sameJson(layer.filter, fromStyle.layers[index].filter) && layer.minzoom === fromStyle.layers[index].minzoom && layer.maxzoom === fromStyle.layers[index].maxzoom);
  if (!keepsShape) return null;
  return toStyle.layers.flatMap((layer, index) => {
    const before = fromStyle.layers[index];
    return [...propertyChanges(layer.id, 'paint', before.paint, layer.paint), ...propertyChanges(layer.id, 'layout', before.layout, layer.layout)];
  });
}

export function layerAboveSurface(style) {
  return style.layers.find((layer) => layer.metadata?.aboveCells || layer.type === 'symbol' || layer.id.startsWith('food-'))?.id;
}
