import { FOOD_KINDS, FINDINGS_PERIOD } from './lens.js';
import { SCENARIO_TRANSIT_THRESHOLDS_MIN } from '../../audit.js';
import { storySteps, clampStep } from '../story/story.js';

const FIRST_STEP = 1;

export const EXAMPLE_START = Object.freeze({ lat: 39.778781626057025, lon: -84.2291723843697, source: 'default' });
export const DEFAULT_PERIOD = FINDINGS_PERIOD;

const DEFAULT_KINDS = Object.freeze(['supermarket']);
const NO_KINDS_IN_URL = 'none';
const MAP_MODES = Object.freeze(['bus', 'walk', 'car']);
const PERIODS = Object.freeze(['peak', 'offPeak']);
const STEP_MODES = Object.freeze(['bus', 'car', 'walk']);
const VIEWS = Object.freeze(['map', 'methodology']);
const STATUS_BY_SOURCE = Object.freeze({ gps: 'located', search: 'searched', zip: 'searched', 'map-point': 'map-point', shared: 'shared', default: 'default' });
export const REST_FOCUS = Object.freeze({ kind: 'rest' });
export const HIGH_NEED_VIEWS = Object.freeze(['outline', 'only', 'off']);
function exampleStartOrigin(notice = null, status = 'default') {
  return { status, point: EXAMPLE_START, label: null, zip: null, notice };
}

export function initialResidentState() {
  return {
    origin: exampleStartOrigin(),
    kinds: [...DEFAULT_KINDS],
    mapMode: 'bus',
    period: DEFAULT_PERIOD,
    view: 'map',
    step: FIRST_STEP,
    exploreView: 0,
    exploreBusLines: false,
    lilaTracts: false,
    sizeByHomes: false,
    highNeedView: 'outline',
    mapOptionsOpen: false,
    focus: REST_FOCUS,
    openSteps: null,
    busLineMin: null,
  };
}

export function openedOnExample(state, placeId) {
  return placeId ? { ...state, focus: auditFocus(placeId) } : state;
}

function auditFocus(placeId) {
  if (!placeId) throw new Error('An audit needs the place it audits');
  return { kind: 'audit', placeId };
}

function chosenStep(step, story) {
  if (!storySteps(story).includes(step)) throw new Error(`Unknown story step: ${step}`);
  return step;
}

function steppedBack(state) {
  return outcome({ ...state, focus: REST_FOCUS, openSteps: null }, 'push', ['focus-story']);
}

function withSupermarkets(kinds) {
  return kinds.includes('supermarket') ? kinds : inCanonicalOrder([...kinds, 'supermarket']);
}

function chosenBusLine(minutes) {
  if (!SCENARIO_TRANSIT_THRESHOLDS_MIN.includes(minutes)) throw new Error(`No bus line of ${minutes} min`);
  return minutes;
}

function hasChosenOrigin(origin) {
  return origin.point.source !== 'default';
}

function routedFrom(state, origin, placeId) {
  if (!hasChosenOrigin(origin) || !placeId) return outcome({ ...state, origin }, 'push', ['recompute']);
  return outcome({ ...state, origin, kinds: withSupermarkets(state.kinds), focus: auditFocus(placeId), openSteps: null }, 'push', ['recompute', 'focus-card']);
}

function originFor({ source, point, label = null, zip = null }, context) {
  if (!STATUS_BY_SOURCE[source]) throw new Error(`Unknown origin source: ${source}`);
  if (source === 'default') return exampleStartOrigin();
  const located = { lat: point.lat, lon: point.lon, source };
  if (!context.isInCounty(located)) return exampleStartOrigin('outside-county', 'off-county');
  return {
    status: STATUS_BY_SOURCE[source],
    point: located,
    label: source === 'search' ? label : null,
    zip: source === 'zip' ? zip : null,
    notice: null,
  };
}

function inCanonicalOrder(kinds) {
  return FOOD_KINDS.filter((kind) => kinds.includes(kind));
}

function toggledKinds(kinds, kind) {
  if (!FOOD_KINDS.includes(kind)) throw new Error(`Unknown food kind: ${kind}`);
  const toggled = kinds.includes(kind) ? kinds.filter((existing) => existing !== kind) : [...kinds, kind];
  return inCanonicalOrder(toggled);
}

function outcome(state, history, effects = []) {
  return { state, history, effects };
}

function unwindOneEscapeLayer(state) {
  if (state.mapOptionsOpen) return outcome({ ...state, mapOptionsOpen: false }, 'none', ['focus-map-options-toggle']);
  if (state.view === 'methodology') return outcome({ ...state, view: 'map' }, 'push', ['focus-view-toggle']);
  if (state.openSteps) return outcome({ ...state, openSteps: null }, 'none', [`focus-steps-toggle:${state.openSteps}`]);
  if (state.focus.kind !== 'rest') return steppedBack(state);
  return outcome(state, 'none', ['focus-search']);
}

export function reduceResidentState(state, event, context) {
  switch (event.type) {
    case 'locateRequested':
      return outcome({ ...state, origin: { ...state.origin, status: 'locating', notice: null } }, 'none', ['request-location']);
    case 'locationDenied':
      return outcome({ ...state, origin: exampleStartOrigin('location-denied', 'denied') }, 'replace', ['recompute']);
    case 'originSet':
      return routedFrom(state, originFor(event, context), event.placeId ?? null);
    case 'kindsToggled':
      return outcome({ ...state, kinds: toggledKinds(state.kinds, event.kind) }, 'push', ['recompute']);
    case 'methodologyToggled':
      return outcome({ ...state, view: state.view === 'methodology' ? 'map' : 'methodology', openSteps: null }, 'push', ['focus-view-toggle']);
    case 'mapModeChanged':
      if (!MAP_MODES.includes(event.mode)) throw new Error(`Unknown map mode: ${event.mode}`);
      return outcome({ ...state, mapMode: event.mode }, 'replace', ['recompute']);
    case 'periodChanged':
      if (!PERIODS.includes(event.period)) throw new Error(`Unknown period: ${event.period}`);
      return outcome({ ...state, period: event.period }, 'replace', ['recompute']);
    case 'placeSelected':
      return outcome({ ...state, focus: auditFocus(event.placeId), openSteps: null }, 'push', ['focus-card']);
    case 'focusBack':
      return steppedBack(state);
    case 'cellTapped':
      if (!context.isInCounty(event.point) || !event.placeId) return outcome({ ...state, focus: REST_FOCUS, openSteps: null }, 'push', ['focus-story']);
      return routedFrom(state, originFor({ source: 'map-point', point: event.point }, context), event.placeId);
    case 'exploreViewChosen':
      if (!Number.isInteger(event.view) || event.view < 0) throw new Error(`Unknown explore view: ${event.view}`);
      return outcome({ ...state, exploreView: event.view }, 'replace', ['animate-step']);
    case 'exploreBusLinesToggled':
      return outcome({ ...state, exploreBusLines: !state.exploreBusLines }, 'replace', ['recompute']);
    case 'lilaTractsToggled':
      return outcome({ ...state, lilaTracts: !state.lilaTracts }, 'replace', ['recompute']);
    case 'sizeByHomesToggled':
      return outcome({ ...state, sizeByHomes: !state.sizeByHomes }, 'replace', ['recompute']);
    case 'highNeedViewChosen':
      if (!HIGH_NEED_VIEWS.includes(event.view) || event.view === state.highNeedView) return outcome(state, 'none');
      return outcome({ ...state, highNeedView: event.view }, 'replace', ['recompute']);
    case 'mapOptionsToggled':
      return outcome({ ...state, mapOptionsOpen: !state.mapOptionsOpen }, 'none', state.mapOptionsOpen ? [] : ['focus-map-options']);
    case 'mapOptionsClosed':
      return outcome({ ...state, mapOptionsOpen: false }, 'none');
    case 'stepSelected':
      return outcome({ ...state, step: chosenStep(event.step, context?.story) }, 'push', ['animate-step']);
    case 'storyStepReached': {
      const step = chosenStep(event.step, context?.story);
      if (step === state.step) return outcome(state, 'none', []);
      return outcome({ ...state, step, focus: REST_FOCUS, openSteps: null }, 'replace', ['animate-step']);
    }
    case 'focusCleared':
      return outcome({ ...state, focus: REST_FOCUS, openSteps: null }, 'push');
    case 'methodologyOpened':
      return outcome({ ...state, view: 'methodology', openSteps: null }, 'push');
    case 'homeOpened':
      return outcome(initialResidentState(), 'push', ['recompute', 'fit-county']);
    case 'mapViewOpened':
      return outcome({ ...state, view: 'map' }, 'push');
    case 'stepsToggled':
      if (!STEP_MODES.includes(event.mode)) throw new Error(`Unknown steps mode: ${event.mode}`);
      return outcome({ ...state, openSteps: state.openSteps === event.mode ? null : event.mode }, 'none', [`focus-steps-toggle:${event.mode}`]);
    case 'stepsOpened':
      if (!STEP_MODES.includes(event.mode)) throw new Error(`Unknown steps mode: ${event.mode}`);
      return outcome({ ...state, openSteps: event.mode }, 'none');
    case 'busLineChosen':
      return outcome({ ...state, busLineMin: chosenBusLine(event.minutes) }, 'replace', ['recompute']);
    case 'escapePressed':
      return unwindOneEscapeLayer(state);
    case 'urlChanged':
      return outcome(residentStateFromUrl(event.search, context), 'none', ['recompute']);
    default:
      throw new Error(`Unknown event: ${event.type}`);
  }
}

function isSameList(first, second) {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

const PRIVATE_POINT_SOURCES = Object.freeze(['gps', 'search', 'map-point']);

function pointForTheAddressBar(point, neighborhoodOf) {
  if (!PRIVATE_POINT_SOURCES.includes(point.source)) return point;
  if (!neighborhoodOf) throw new Error(`A ${point.source} start needs neighborhoodOf before it can go in a URL`);
  return neighborhoodOf(point);
}

export function residentStateToUrl(state, { neighborhoodOf } = {}) {
  const parameters = new URLSearchParams();
  const origin = state.origin;
  const point = origin.point.source === 'default' ? null : pointForTheAddressBar(origin.point, neighborhoodOf);
  if (point) {
    parameters.set('from', `${point.lat},${point.lon}`);
    parameters.set('source', origin.point.source);
    if (origin.zip !== null) parameters.set('zip', origin.zip);
  }
  if (!isSameList(state.kinds, DEFAULT_KINDS)) parameters.set('kinds', state.kinds.length === 0 ? NO_KINDS_IN_URL : state.kinds.join(','));
  if (state.mapMode !== 'bus') parameters.set('map', state.mapMode);
  if (state.period !== DEFAULT_PERIOD) parameters.set('period', state.period);
  if (state.step !== FIRST_STEP) parameters.set('step', String(state.step));
  if (state.exploreView !== 0) parameters.set('look', String(state.exploreView));
  if (state.exploreBusLines) parameters.set('lines', 'bus');
  if (state.lilaTracts) parameters.set('lila', 'on');
  if (state.sizeByHomes) parameters.set('size', 'homes');
  if (state.highNeedView !== 'outline') parameters.set('isolated', state.highNeedView);
  if (state.busLineMin !== null) parameters.set('cutoff', String(state.busLineMin));
  if (state.focus.kind === 'audit') parameters.set('place', state.focus.placeId);
  if (state.view !== 'map') parameters.set('view', state.view);
  const query = parameters.toString();
  return query ? `?${query}` : '';
}

function coordinatesFrom(text) {
  const parts = (text ?? '').split(',');
  if (parts.length !== 2 || parts.some((part) => part.trim() === '')) return null;
  const [lat, lon] = parts.map(Number);
  const plausible = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  return plausible ? { lat, lon } : null;
}

function originFromParameters(parameters, context) {
  const source = parameters.get('source');
  const point = coordinatesFrom(parameters.get('from'));
  if (!point || !STATUS_BY_SOURCE[source] || source === 'default') return exampleStartOrigin();
  const zip = parameters.get('zip');
  if (source === 'zip' && !/^\d{5}$/.test(zip ?? '')) return exampleStartOrigin();
  return originFor({ source, point, label: parameters.get('label') ?? null, zip }, context);
}

function focusFromParameters(parameters) {
  const placeId = parameters.get('place');
  return placeId ? auditFocus(placeId) : REST_FOCUS;
}

function kindsFromParameter(text) {
  if (text === null) return [...DEFAULT_KINDS];
  if (text === NO_KINDS_IN_URL) return [];
  const kinds = inCanonicalOrder(text.split(','));
  return kinds.length > 0 ? kinds : [...DEFAULT_KINDS];
}

function wholeAtLeastZero(text) {
  const whole = Number.parseInt(text ?? '', 10);
  return Number.isInteger(whole) && whole > 0 ? whole : 0;
}

function busLineFromParameter(text) {
  const minutes = Number.parseInt(text ?? '', 10);
  return SCENARIO_TRANSIT_THRESHOLDS_MIN.includes(minutes) ? minutes : null;
}

function oneOf(allowed, value, fallback) {
  return allowed.includes(value) ? value : fallback;
}

export function residentStateFromUrl(search, context) {
  const parameters = new URLSearchParams(search ?? '');
  return {
    origin: originFromParameters(parameters, context),
    kinds: kindsFromParameter(parameters.get('kinds')),
    mapMode: oneOf(MAP_MODES, parameters.get('map'), 'bus'),
    period: oneOf(PERIODS, parameters.get('period'), DEFAULT_PERIOD),
    view: oneOf(VIEWS, parameters.get('view'), 'map'),
    step: clampStep(parameters.get('step') ?? FIRST_STEP),
    exploreView: wholeAtLeastZero(parameters.get('look')),
    exploreBusLines: parameters.get('lines') === 'bus',
    lilaTracts: parameters.get('lila') === 'on',
    sizeByHomes: parameters.get('size') === 'homes',
    highNeedView: oneOf(HIGH_NEED_VIEWS, parameters.get('isolated'), 'outline'),
    mapOptionsOpen: false,
    focus: focusFromParameters(parameters),
    openSteps: null,
    busLineMin: busLineFromParameter(parameters.get('cutoff')),
  };
}

export function shareableUrl(state, { neighborhoodOf } = {}) {
  if (!PRIVATE_POINT_SOURCES.includes(state.origin.point.source)) return residentStateToUrl(state, { neighborhoodOf });
  if (!neighborhoodOf) throw new Error(`A ${state.origin.point.source} start needs neighborhoodOf before it can be shared`);
  const neighborhood = neighborhoodOf(state.origin.point);
  if (!neighborhood) return residentStateToUrl({ ...state, origin: initialResidentState().origin });
  const sharedPoint = { lat: neighborhood.lat, lon: neighborhood.lon, source: 'shared' };
  return residentStateToUrl({ ...state, origin: { ...state.origin, status: 'shared', label: null, point: sharedPoint } });
}
