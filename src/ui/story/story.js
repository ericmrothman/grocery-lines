import { STORY_DEFINITION } from './story_definition.js';
import { FINDINGS_PERIOD } from '../shared/lens.js';
import { estimateTrip, periodAt, tripLeavingAt, tripTimedToTheBus } from '../../mobility.js';

const STORY_TRIP_KINDS = Object.freeze(['supermarket']);
export const MAP_CARD_CHART = 'mapCard';

export function storySteps(story = STORY_DEFINITION) {
  return story.steps.map((unused, index) => index + 1);
}

export function clampStep(step, story = STORY_DEFINITION) {
  const whole = Number.parseInt(step, 10);
  if (!Number.isFinite(whole)) return 1;
  return Math.min(story.steps.length, Math.max(1, whole));
}

export function storyStep(step, story = STORY_DEFINITION) {
  const found = story.steps[step - 1];
  if (!Number.isInteger(step) || !found) throw new Error(`Unknown story step: ${step}`);
  return found;
}

function exploreViewIndex(data, exploreView) {
  const last = data.explore ? data.explore.views.length - 1 : 0;
  return Number.isInteger(exploreView) ? Math.min(last, Math.max(0, exploreView)) : 0;
}

export function stepView(step, story = STORY_DEFINITION, exploreView = 0) {
  return viewOf(storyStep(step, story), step, exploreView);
}

const HIGH_NEED_VIEW_SHOWS = Object.freeze({
  outline: {},
  only: { highNeedOutline: false, onlyPastLine: true, onlyCarless: true, onlyLivedIn: true },
  off: { highNeedOutline: false },
});

export function mapPageView(story = STORY_DEFINITION, exploreView = 0, mapOptions = null) {
  const view = viewOf(story.map, null, exploreView);
  return mapOptions ? { ...view, sizeByHomes: mapOptions.sizeByHomes, busRoutes: mapOptions.busRoutes, lilaTracts: mapOptions.lilaTracts, ...HIGH_NEED_VIEW_SHOWS[mapOptions.highNeedView ?? 'outline'] } : view;
}

function viewOf(stepData, step, exploreView) {
  const viewIndex = exploreViewIndex(stepData, exploreView);
  const data = stepData.explore ? { ...stepData, ...stepData.explore.views[viewIndex] } : stepData;
  return {
    step,
    hexagons: data.hexagons,
    routes: stepData.routes,
    busRoutes: data.busLines,
    lockedTrip: data.trip === 'chosen' ? null : { kinds: STORY_TRIP_KINDS, mapMode: data.trip, period: FINDINGS_PERIOD },
    pinKinds: data.trip === 'chosen' ? null : data.kinds,
    onlyPastLine: data.pastLineOnly,
    onlyCarless: data.carlessOnly,
    onlyLivedIn: data.livedInOnly,
    colorBy: data.colorBy,
    sizeByHomes: data.sizeByHomes,
    hexagonGaps: stepData.hexagonGaps,
    highNeedOutline: data.highNeedOutline,
    zoomToRoute: data.zoomToRoute,
    panel: data.panel,
    copy: stepData.copy,
    annotation: stepData.annotation,
    chart: stepData.chart ?? null,
    spotlight: stepData.spotlight,
    lilaTracts: data.lilaTracts,
    tripLines: stepData.tripLines,
    routeMiles: stepData.routeMiles,
    modeBars: stepData.modeBars,
    breakBefore: stepData.breakBefore,
    radiusMiles: stepData.radiusMiles,
    route: stepData.route,
    explore: stepData.explore ? { labels: stepData.explore.views.map((view) => view.label), chosen: viewIndex } : null,
  };
}

function pathParts(path) {
  return path.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

export function withChange(definition, path, value) {
  const [head, ...rest] = pathParts(path);
  const copy = Array.isArray(definition) ? [...definition] : { ...definition };
  copy[head] = rest.length === 0 ? structuredClone(value) : withChange(definition?.[head] ?? {}, rest.join('.'), value);
  return copy;
}

export function withChanges(definition, changes) {
  return Object.entries(changes).reduce((changed, [path, value]) => withChange(changed, path, value), definition);
}

function stepMapChanges(stepData) {
  const shown = Object.fromEntries(Object.entries(stepData.basemap).map(([key, value]) => [`basemap.${key}`, value]));
  const solid = stepData.solidHexagons ? { 'surface.opacity': 1, 'surface.opacityUnderTrip': 1 } : {};
  return { ...shown, 'surface.livedInOnly': false, 'surface.sizeByHomes': stepData.sizeByHomes, ...solid };
}

export function stepMapStyle(step, theme, story = STORY_DEFINITION) {
  return withChanges(theme, stepMapChanges(storyStep(step, story)));
}

export function mapPageMapStyle(theme, story = STORY_DEFINITION) {
  return withChanges(theme, stepMapChanges(story.map));
}

export function mapStylesForSteps(theme, story = STORY_DEFINITION) {
  return Object.freeze(Object.fromEntries(storySteps(story).map((step) => [step, stepMapStyle(step, theme, story)])));
}

export function exploreTripFor(route, { network, method, placesById }) {
  const place = placesById.get(route.placeId);
  return place ? estimateTrip({ ...route.from, source: 'map-point' }, place, network, method, { period: FINDINGS_PERIOD }) : null;
}

export function storyTripFor(route, { network, method, placesById }) {
  const place = placesById.get(route.placeId);
  if (!place) return null;
  const leaveAt = route.leaveAt ?? null;
  const trip = estimateTrip({ ...route.from, source: 'map-point' }, place, network, method, { period: leaveAt === null ? FINDINGS_PERIOD : periodAt(leaveAt, method) });
  return leaveAt === null ? tripTimedToTheBus(trip, network, method) : tripLeavingAt(trip, network, method, leaveAt);
}
