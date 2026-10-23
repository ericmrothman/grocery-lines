import { namedFlavor } from '../../../vendor/protomaps-basemaps-5.7.2/basemaps.js';
import { READABLE_TEXT_CONTRAST, colorDifference, contrastRatio, parseColor, readableOn } from './color.js';

export const MAP_STYLE_SCHEMES = Object.freeze(['light', 'dark']);
export const SURFACE_SHAPES = Object.freeze(['hex', 'dot', 'ring', 'square', 'diamond']);
export const BASEMAP_FLAVORS = Object.freeze(['light', 'dark', 'white', 'grayscale', 'black']);
const ROAD_DETAIL = Object.freeze(['all', 'major', 'none']);
export const BASEMAP_FONTS = Object.freeze(['Noto Sans', 'Inter', 'IBM Plex Mono', 'Barlow Condensed']);
export const RAMP_STEPS = 5;
export const SLOW_END_SMALLEST_CONTRAST = 3;
const NEAR_ALERT_DELTA_E = 20;

const PALETTE_COLORS = Object.freeze([
  'ground', 'roadColor', 'labelHalo', 'ghost', 'countyLine', 'busNetwork', 'highNeed', 'highNeedCasing', 'lila', 'selected',
  'startCellFallback', 'car', 'bus', 'walk', 'pinSupermarket', 'pinPantry', 'pinOther', 'pinEdge', 'start', 'startInk',
]);

const OPTIONAL_PALETTE_COLORS = Object.freeze(['ground', 'roadColor', 'labelHalo']);

export function paletteFor(definition, scheme) {
  return definition.palettes[scheme] ?? definition.palettes.light;
}

export function groundColor(definition, scheme) {
  const palette = paletteFor(definition, scheme);
  return palette.ground ?? namedFlavor(BASEMAP_FLAVORS.includes(palette.basemap) ? palette.basemap : 'light').earth;
}

export function surfaceFill(definition, cell, fill) {
  return definition.surface.livedInOnly && !cell.populated ? null : fill ?? null;
}

export function surfaceOpacity(definition, hasTrip) {
  return hasTrip ? definition.surface.opacityUnderTrip : definition.surface.opacity;
}

const LIGHT_TEXT_ON_COLOR = '#ffffff';
const DARK_TEXT_ON_COLOR = '#0b1a1c';

const MAP_KEY_INK = '#9a9a9a';

export function roadColorOf(definition, scheme) {
  const palette = paletteFor(definition, scheme);
  return palette.roadColor ?? namedFlavor(BASEMAP_FLAVORS.includes(palette.basemap) ? palette.basemap : 'light').major;
}

export function cssVariablesFor(definition, scheme, { panel = scheme === 'dark' ? '#172226' : '#ffffff' } = {}) {
  const palette = paletteFor(definition, scheme);
  const ramp = Object.fromEntries(palette.ramp.map((color, index) => [`--ramp-${index + 1}`, color ?? palette.ghost]));
  const inkOnBus = contrastRatio(LIGHT_TEXT_ON_COLOR, palette.bus) >= READABLE_TEXT_CONTRAST ? LIGHT_TEXT_ON_COLOR : DARK_TEXT_ON_COLOR;
  return {
    ...ramp,
    '--high-need': palette.highNeed,
    '--high-need-casing': palette.highNeedCasing,
    '--lila': palette.lila,
    '--lila-fill-opacity': String(definition.lines?.lila?.fillOpacity ?? 0),
    '--mode-car': palette.car,
    '--mode-bus': palette.bus,
    '--mode-walk': palette.walk,
    '--pin-edge': palette.pinEdge,
    '--pin-supermarket': palette.pinSupermarket,
    '--pin-pantry': palette.pinPantry,
    '--pin-other': palette.pinOther,
    '--text-car': readableOn(palette.car, panel),
    '--text-bus': readableOn(palette.bus, panel),
    '--text-walk': readableOn(palette.walk, panel),
    '--ink-on-bus': inkOnBus,
    '--map-ground': groundColor(definition, scheme),
    '--map-road': roadColorOf(definition, scheme),
    '--map-key-ink': readableOn(MAP_KEY_INK, roadColorOf(definition, scheme)),
  };
}

export function overlayLook(definition, scheme) {
  const palette = paletteFor(definition, scheme);
  return {
    pins: definition.pins,
    routes: definition.routes,
    colors: {
      pinByKind: { supermarket: palette.pinSupermarket, pantry: palette.pinPantry, 'other-retailer': palette.pinOther },
      pinEdge: palette.pinEdge,
      selected: palette.selected,
      start: palette.start,
      startInk: palette.startInk,
      car: palette.car,
      bus: palette.bus,
      walk: palette.walk,
    },
  };
}

function isColor(value) {
  return parseColor(value) !== null;
}

export function mapStyleProblems(definition) {
  const problems = [];
  const need = (condition, problem) => {
    if (!condition) problems.push(problem);
  };
  need(typeof definition?.name === 'string' && definition.name.length > 0, 'the style needs a name');
  const surface = definition?.surface ?? {};
  need(SURFACE_SHAPES.includes(surface.shape), `surface.shape must be one of ${SURFACE_SHAPES.join(', ')}`);
  for (const key of ['size', 'hexFromZoom', 'glow', 'opacity', 'opacityUnderTrip']) need(Number.isFinite(surface[key]) && surface[key] >= 0, `surface.${key} must be a number of at least 0`);
  need(typeof surface.sizeByHomes === 'boolean', 'surface.sizeByHomes must be true or false');
  need(Number.isFinite(surface.homesFloor) && surface.homesFloor > 0 && surface.homesFloor <= 1, 'surface.homesFloor must be a number above 0 and at most 1');
  need(Number.isFinite(surface.gappedSize) && surface.gappedSize > 0 && surface.gappedSize <= 1, 'surface.gappedSize must be a number above 0 and at most 1');
  need(typeof surface.livedInOnly === 'boolean', 'surface.livedInOnly must be true or false');
  need(typeof surface.ghost?.visible === 'boolean' && Number.isFinite(surface.ghost?.size) && Number.isFinite(surface.ghost?.opacity), 'surface.ghost needs visible, size and opacity');
  const basemap = definition?.basemap ?? {};
  for (const key of ['labels', 'landuse', 'water', 'buildings']) need(typeof basemap[key] === 'boolean', `basemap.${key} must be true or false`);
  need(ROAD_DETAIL.includes(basemap.roads), `basemap.roads must be one of ${ROAD_DETAIL.join(', ')}`);
  need(Number.isFinite(basemap.roadWidthScale) && Number.isFinite(basemap.roadOpacity), 'basemap needs roadWidthScale and roadOpacity');
  need(typeof basemap.roadsAboveCells === 'boolean', 'basemap.roadsAboveCells must be true or false');
  need(Number.isFinite(basemap.labelHaloPx) && basemap.labelHaloPx >= 0, 'basemap.labelHaloPx must be a number of at least 0');
  need(basemap.font === undefined || BASEMAP_FONTS.includes(basemap.font), `basemap.font must be one of ${BASEMAP_FONTS.join(', ')}`);
  const lines = definition?.lines ?? {};
  for (const key of ['countyPx', 'busNetworkPx', 'busNetworkOpacity', 'startCellPx', 'startCellEdgeShade']) need(Number.isFinite(lines[key]), `lines.${key} must be a number`);
  need(['single', 'agency'].includes(lines.busNetworkColors), 'lines.busNetworkColors must be single or agency');
  need(['lineWidthPx', 'casingWidthPx'].every((key) => Number.isFinite(lines.highNeed?.[key])), 'lines.highNeed needs lineWidthPx and casingWidthPx');
  need(Number.isFinite(lines.lila?.lineWidthPx) && Number.isFinite(lines.lila?.fillOpacity) && lines.lila.fillOpacity >= 0 && lines.lila.fillOpacity <= 1, 'lines.lila needs lineWidthPx and a fillOpacity from 0 to 1');
  need(['sizePx', 'selectedSizePx'].every((key) => Number.isFinite(definition?.pins?.[key])), 'pins needs sizePx and selectedSizePx');
  need(['walkPx', 'busPx', 'carPx', 'casingPx', 'otherWayOpacity'].every((key) => Number.isFinite(definition?.routes?.[key])), 'routes needs walkPx, busPx, carPx, casingPx and otherWayOpacity');
  need(Array.isArray(definition?.routes?.walkDash) && definition.routes.walkDash.length === 2 && definition.routes.walkDash.every((length) => Number.isFinite(length) && length > 0), 'routes.walkDash must be [dash, gap] in pixels');
  for (const scheme of MAP_STYLE_SCHEMES) {
    const palette = definition?.palettes?.[scheme];
    if (!palette) {
      problems.push(`palettes.${scheme} is missing`);
      continue;
    }
    need(BASEMAP_FLAVORS.includes(palette.basemap), `palettes.${scheme}.basemap must be one of ${BASEMAP_FLAVORS.join(', ')}`);
    need(Array.isArray(palette.ramp) && palette.ramp.length === RAMP_STEPS && palette.ramp.every((color) => color === null || isColor(color)), `palettes.${scheme}.ramp must be ${RAMP_STEPS} colours (null leaves a step unpainted)`);
    need(Array.isArray(palette.ramp) && palette.ramp.some((color) => color !== null), `palettes.${scheme}.ramp needs at least one painted step`);
    for (const key of PALETTE_COLORS) {
      const optional = OPTIONAL_PALETTE_COLORS.includes(key);
      need((optional && palette[key] === null) || isColor(palette[key]), `palettes.${scheme}.${key} must be a colour${optional ? ' or null' : ''}`);
    }
  }
  return problems;
}

export function slowestRampColor(palette) {
  return [...palette.ramp].reverse().find((color) => color !== null);
}

export function mapStyleWarnings(definition, { alertColors = {} } = {}) {
  const warnings = [];
  for (const scheme of MAP_STYLE_SCHEMES) {
    const palette = paletteFor(definition, scheme);
    const ground = groundColor(definition, scheme);
    palette.ramp.forEach((color, step) => {
      if (color === null) return;
      const ratio = contrastRatio(color, ground);
      if (ratio < SLOW_END_SMALLEST_CONTRAST) warnings.push({ scheme, step, kind: 'contrast', ratio, message: `${scheme}: step ${step + 1} (${color}) is ${ratio.toFixed(2)}:1 against the ground ${ground}; those cells fade into the map` });
      for (const alert of alertColors[scheme] ?? []) {
        const distance = colorDifference(color, alert);
        if (distance === 0) warnings.push({ scheme, step, kind: 'alert', message: `${scheme}: step ${step + 1} is the alert colour ${alert}, which is reserved for severe disparity and failed layers` });
        else if (distance < NEAR_ALERT_DELTA_E) warnings.push({ scheme, step, kind: 'near-alert', distance, message: `${scheme}: step ${step + 1} (${color}) is close to the alert colour ${alert} (difference ${distance.toFixed(1)})` });
      }
    });
    const steps = palette.ramp.filter((color) => color !== null);
    steps.slice(1).forEach((color, index) => {
      const ratio = contrastRatio(color, steps[index]);
      if (ratio < 1.1 && colorDifference(color, steps[index]) > 0) warnings.push({ scheme, kind: 'neighbours', ratio, message: `${scheme}: ${steps[index]} and ${color} are hard to tell apart` });
    });
  }
  return warnings;
}
