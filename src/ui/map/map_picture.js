import { param } from '../../method.js';
import { haversineMi } from '../../geo.js';
import { destinationWords, destinationNameWords, tripMilesWords } from '../../language.js';
import { stepView } from '../story/story.js';
import { tripSettings, surfaceBins, surfaceValueForCell, binIndex } from '../shared/lens.js';
import { highNeedCells, highNeedOutline } from './high_need.js';
import { mixedColor } from './color.js';

const NO_ROUTES = Object.freeze({ lines: Object.freeze([]), busStops: Object.freeze([]), stopsPassed: Object.freeze([]) });
const PAST_LINE_RAMP_STEP = 3;
const RADIUS_KIND = 'supermarket';
const UNLIT_CELL_KEEPS = 0.4;
const PLAIN_CELL_KEEPS = 0.5;

function destinationCallout(route, providers) {
  const place = providers.find((provider) => provider.id === route.placeId);
  return place ? { text: destinationWords(place.name, haversineMi(route.from, place)), at: { lat: place.lat, lon: place.lon } } : null;
}

function unbinnedFill(view, colors) {
  if (view.colorBy === 'plain') return mixedColor(colors.ramp[0], colors.ground, PLAIN_CELL_KEEPS);
  return colors.ramp[PAST_LINE_RAMP_STEP] ?? colors.ramp.at(-1);
}

function spotlitCell(view, start, { cells, hexGrid }) {
  if (!view.spotlight || !view.route) return null;
  return cells[hexGrid.nearestCellIndex(start)] ?? null;
}

function spotlitBinOf(cell, valueOptions, bins) {
  const value = surfaceValueForCell(cell, valueOptions);
  return value === null ? null : binIndex(value, bins.upperBounds);
}

function busTripOnly(routes) {
  return { ...routes, lines: routes.lines.filter((line) => line.trip === 'bus') };
}

const TRIP_LINES_WITH_THE_STRAIGHT_LINE = Object.freeze(['straightLine', 'both']);
const TRIP_LINES_WITH_THE_STREETS = Object.freeze(['streets', 'both', 'tripOnly']);

function placeOf(route, providers) {
  return providers.find((provider) => provider.id === route.placeId) ?? null;
}

function shownStraightLine(view, providers) {
  if (!view.route || !TRIP_LINES_WITH_THE_STRAIGHT_LINE.includes(view.tripLines)) return null;
  const place = placeOf(view.route, providers);
  if (!place) return null;
  return { from: view.route.from, to: { lat: place.lat, lon: place.lon }, label: tripMilesWords(haversineMi(view.route.from, place)) };
}

function onlyTheStepsTrip(routes, view) {
  const mode = view.lockedTrip?.mapMode;
  return { lines: routes.lines.filter((line) => line.trip === mode), busStops: mode === 'bus' ? routes.busStops : [], stopsPassed: mode === 'bus' ? routes.stopsPassed : [] };
}

function labelledByMiles(routes) {
  const longestOf = new Map();
  for (const line of routes.lines) if (!longestOf.has(line.trip) || line.miles > longestOf.get(line.trip).miles) longestOf.set(line.trip, line);
  return { ...routes, lines: routes.lines.map((line) => ({ ...line, label: longestOf.get(line.trip) === line ? tripMilesWords(line.legMiles) : null })) };
}

function shownRoutes(view, drawnTrip) {
  if (view.route && !TRIP_LINES_WITH_THE_STREETS.includes(view.tripLines)) return NO_ROUTES;
  const drawn = drawnTrip ?? NO_ROUTES;
  const routes = view.tripLines === 'tripOnly' ? onlyTheStepsTrip(drawn, view) : drawn;
  return view.routeMiles ? labelledByMiles(routes) : routes;
}

function shownCallout(view, spotlight, providers, drawnTrip) {
  if (spotlight || !view.route) return null;
  const place = placeOf(view.route, providers);
  if (!place || view.tripLines === 'streets') return destinationCallout(view.route, providers);
  const straight = [[view.route.from.lon, view.route.from.lat], [place.lon, place.lat]];
  return { text: destinationNameWords(place.name), at: { lat: place.lat, lon: place.lon }, avoidLines: [straight, ...(drawnTrip?.lines ?? []).map((line) => line.line)] };
}

function shownPlaceId(view, focus) {
  if (view.route) return view.route.placeId;
  return focus.kind === 'audit' ? focus.placeId : null;
}

const outlinesByCells = new WeakMap();

export function shownHighNeedOutline({ cells, hexGrid, carlessPctOf, method, lineMin, period }) {
  if (!outlinesByCells.has(cells)) outlinesByCells.set(cells, new Map());
  const byLine = outlinesByCells.get(cells);
  const key = `${lineMin}|${period}`;
  if (!byLine.has(key)) byLine.set(key, highNeedOutline(highNeedCells(cells, { carlessPctOf, method, lineMin, period }), hexGrid));
  return byLine.get(key);
}

export function mapPicture(state, { providers, hexGrid, busNetworkRoutes, cells, method, drawnTrip, carlessPctOf, lilaTracts = null, story, view = stepView(state.step, story, state.exploreView) }) {
  const trip = tripSettings(view, state);
  const pinKinds = view.explore ? state.kinds : view.pinKinds ?? trip.kinds;
  const lineMin = state.busLineMin ?? param(method, 'desertTransitMin');
  const bins = surfaceBins(view, trip.mapMode, method, lineMin);
  const valueOptions = { view, ...trip, carlessPctOf, method, lineMin };
  const start = view.route ? view.route.from : state.origin.point;
  const spotlight = spotlitCell(view, start, { cells, hexGrid });
  const routes = shownRoutes(view, drawnTrip);
  return {
    step: state.step,
    look: `${view.step ?? 'map'}:${view.explore ? view.explore.chosen : 0}:${view.sizeByHomes ? 'homes' : 'flat'}:${lineMin}:${[view.onlyPastLine, view.onlyCarless, view.onlyLivedIn].map(Number).join('')}`,
    fillForCell: (cell, colors) => {
      const value = surfaceValueForCell(cell, valueOptions);
      if (value === null) return null;
      const fill = bins ? colors.ramp[binIndex(value, bins.upperBounds)] : unbinnedFill(view, colors);
      return spotlight && cell !== spotlight ? mixedColor(fill, colors.ground, UNLIT_CELL_KEEPS) : fill;
    },
    sizeByHomes: view.sizeByHomes,
    gapped: Boolean(view.hexagonGaps),
    canInspect: (cell) => surfaceValueForCell(cell, valueOptions) !== null,
    places: providers.filter((provider) => pinKinds.includes(provider.kind) || provider.id === view.route?.placeId),
    selectedPlaceId: shownPlaceId(view, state.focus),
    start,
    startCellIndex: hexGrid.nearestCellIndex(start),
    startCellStressed: Boolean(spotlight),
    spotlitBin: spotlight && bins ? spotlitBinOf(spotlight, valueOptions, bins) : null,
    radius: view.radiusMiles ? { miles: view.radiusMiles, centres: providers.filter((provider) => provider.kind === RADIUS_KIND).map(({ lat, lon }) => ({ lat, lon })) } : null,
    routes: spotlight ? busTripOnly(routes) : routes,
    busNetwork: busNetworkRoutes,
    busLinesShown: view.explore ? state.exploreBusLines : view.busRoutes,
    highNeedOutline: view.highNeedOutline ? shownHighNeedOutline({ cells, hexGrid, carlessPctOf, method, lineMin, period: trip.period }) : null,
    lilaTracts: view.lilaTracts ? lilaTracts : null,
    annotation: view.annotation ?? null,
    callout: shownCallout(view, spotlight, providers, drawnTrip),
    straightLine: shownStraightLine(view, providers),
  };
}
