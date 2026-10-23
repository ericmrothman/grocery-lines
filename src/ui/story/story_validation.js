import { FOOD_KINDS } from '../shared/lens.js';
import { mapStyleProblems } from '../map/map_theme.js';
import { GROCERY_CHART_STAGES } from '../grocery/grocery_runs.js';
import { METHOD } from '../../method.js';
import { periodAt } from '../../mobility.js';
import { MAP_CARD_CHART, stepMapStyle, mapPageMapStyle } from './story.js';

const STEP_TRIPS = Object.freeze(['chosen', 'bus', 'car']);
const STEP_COLOURS = Object.freeze(['travel', 'pastLine', 'carless', 'plain']);
const STEP_PANELS = Object.freeze([null, 'finding']);
const TRIP_LINES = Object.freeze(['streets', 'straightLine', 'both', 'tripOnly']);
const STEP_SWITCHES = Object.freeze(['modeBars', 'routes', 'hexagons', 'pastLineOnly', 'carlessOnly', 'livedInOnly', 'sizeByHomes', 'busLines', 'highNeedOutline', 'zoomToRoute', 'solidHexagons', 'spotlight', 'lilaTracts', 'routeMiles', 'hexagonGaps']);
export const TRIP_ONLY_SWITCHES = Object.freeze({
  modeBars: Object.freeze({ off: false, reason: 'shows car, walking and bus bars for its trip' }),
  spotlight: Object.freeze({ off: false, reason: 'spotlights its trip\'s home block' }),
  routeMiles: Object.freeze({ off: false, reason: 'measures its trip in miles' }),
  tripLines: Object.freeze({ off: 'streets', reason: 'measures its trip in miles' }),
});
export const ROAD_CHOICES = Object.freeze(['all', 'major', 'none']);
const BASEMAP_SWITCHES = Object.freeze(['labels', 'landuse', 'water', 'buildings', 'roadsAboveCells']);
const EXPLORE_VIEW_KEYS = Object.freeze(['trip', 'colorBy', 'pastLineOnly', 'carlessOnly', 'livedInOnly', 'sizeByHomes']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function basemapProblems(basemap, name) {
  if (!isPlainObject(basemap)) return [`${name} needs basemap settings (roads, ${BASEMAP_SWITCHES.join(', ')})`];
  const problems = ROAD_CHOICES.includes(basemap.roads) ? [] : [`${name} roads must be one of ${ROAD_CHOICES.join(', ')}`];
  for (const key of BASEMAP_SWITCHES) if (typeof basemap[key] !== 'boolean') problems.push(`${name} ${key} must be true or false`);
  for (const key of Object.keys(basemap)) if (key !== 'roads' && !BASEMAP_SWITCHES.includes(key)) problems.push(`${name} basemap cannot set ${key}; the theme decides it`);
  return problems;
}

function exploreViewProblems(view, name) {
  const problems = typeof view?.label === 'string' && view.label.trim() !== '' ? [] : [`${name} needs a label`];
  for (const [key, value] of Object.entries(view ?? {}).filter(([key]) => key !== 'label')) {
    if (!EXPLORE_VIEW_KEYS.includes(key)) problems.push(`${name} cannot change ${key}`);
    else if (key === 'trip' && !STEP_TRIPS.includes(value)) problems.push(`${name} trip must be one of ${STEP_TRIPS.join(', ')}`);
    else if (key === 'colorBy' && !STEP_COLOURS.includes(value)) problems.push(`${name} colour must be one of ${STEP_COLOURS.join(', ')}`);
    else if (!['trip', 'colorBy'].includes(key) && typeof value !== 'boolean') problems.push(`${name} ${key} must be true or false`);
  }
  return problems;
}

function isPoint(point) {
  return Number.isFinite(point?.lat) && Number.isFinite(point?.lon) && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180;
}

function caseStudyProblems(data, name) {
  const problems = [];
  if (typeof data.copy !== 'string') problems.push(`${name} copy must be text (it can be empty)`);
  if (data.radiusMiles !== null && !(Number.isFinite(data.radiusMiles) && data.radiusMiles > 0)) problems.push(`${name} radiusMiles must be a number of miles above 0, or null`);
  if (data.route !== null && !(isPoint(data.route?.from) && typeof data.route?.placeId === 'string' && data.route.placeId !== '')) problems.push(`${name} route must be null or { from: { lat, lon }, placeId }`);
  if (data.route?.leaveAt !== undefined && data.route.leaveAt !== null && periodAt(data.route.leaveAt, METHOD) === null) problems.push(`${name} route leaveAt must be minutes after midnight in the rush-hour or midday window, or left out to time the trip to the bus`);
  if (data.route !== null && data.explore !== null) problems.push(`${name} cannot fix one trip and also hand over the map`);
  return problems;
}

function isText(value) {
  return typeof value === 'string';
}

function annotationProblems(data, name) {
  const problems = [];
  if (data.annotation !== null && !(isText(data.annotation?.text) && isPoint(data.annotation?.at))) problems.push(`${name} annotation must be null or { text, at: { lat, lon } }`);
  const pause = data.breakBefore;
  if (pause !== null && !(Array.isArray(pause?.figures) && pause.figures.every((figure) => isText(figure?.value) && isText(figure?.words)) && isText(pause?.copy))) problems.push(`${name} breakBefore must be null or { figures: [{ value, words }], copy }`);
  return problems;
}

function chartProblems(data, name, story) {
  const { chart } = data;
  if (chart === null) return [];
  if (chart === MAP_CARD_CHART) return data.route ? [] : [`${name} shows the map's bars for its trip, so it needs a route`];
  if (!GROCERY_CHART_STAGES.includes(chart)) return [`${name} chart must be null, ${MAP_CARD_CHART}, or one of ${GROCERY_CHART_STAGES.join(', ')}`];
  return story.groceryRun ? [] : [`${name} shows the grocery-run chart, so the story needs a groceryRun`];
}

function groceryRunProblems(run) {
  if (run === null || run === undefined) return [];
  const departures = run.departures ?? {};
  const problems = [];
  if (!isPoint(run.from) || typeof run.placeId !== 'string' || run.placeId === '') problems.push('The grocery run needs from: { lat, lon } and a placeId');
  if (!['firstMin', 'lastMin', 'everyMin'].every((key) => Number.isFinite(departures[key])) || departures.everyMin <= 0 || departures.firstMin > departures.lastMin) problems.push('The grocery run needs departures { firstMin, lastMin, everyMin } in minutes after midnight');
  if (!Array.isArray(run.shopMins) || run.shopMins.length !== 2 || !run.shopMins.every((minutes) => Number.isFinite(minutes) && minutes > 0) || run.shopMins[0] >= run.shopMins[1]) problems.push('The grocery run needs shopMins: [shorter, longer]');
  if (!['peak', 'offPeak'].includes(run.period)) problems.push('The grocery run period must be peak or offPeak');
  return problems;
}

function exploreProblems(explore, name) {
  if (explore === null) return [];
  if (!Array.isArray(explore?.views) || explore.views.length === 0) return [`${name} explore needs at least one view, or null`];
  return explore.views.flatMap((view, index) => exploreViewProblems(view, `${name} explore view ${index + 1}`));
}

const INTRO_TEXTS = Object.freeze(['kicker', 'title', 'deck', 'byline', 'date', 'summary']);

function stepProblems(data, name, styleOf, story) {
  const problems = [];
  if ('style' in data || 'styleChanges' in data) problems.push(`${name} carries its own look; steps only choose what shows, the theme decides how it looks`);
  if (!STEP_TRIPS.includes(data.trip)) problems.push(`${name} trip must be one of ${STEP_TRIPS.join(', ')}`);
  if (!STEP_COLOURS.includes(data.colorBy)) problems.push(`${name} colour must be one of ${STEP_COLOURS.join(', ')}`);
  if (!STEP_PANELS.includes(data.panel)) problems.push(`${name} panel must be none or finding`);
  for (const key of STEP_SWITCHES) if (typeof data[key] !== 'boolean') problems.push(`${name} ${key} must be true or false`);
  problems.push(...basemapProblems(data.basemap, name));
  if (data.colorBy === 'pastLine' && !data.pastLineOnly) problems.push(`${name} colours cells by the line, so it must show only cells past the line`);
  if (!Array.isArray(data.kinds) || !data.kinds.every((kind) => FOOD_KINDS.includes(kind))) problems.push(`${name} kinds must be a list of ${FOOD_KINDS.join(', ')}`);
  problems.push(...caseStudyProblems(data, name));
  problems.push(...annotationProblems(data, name));
  problems.push(...chartProblems(data, name, story));
  if (!TRIP_LINES.includes(data.tripLines)) problems.push(`${name} trip lines must be one of ${TRIP_LINES.join(', ')}`);
  if (!data.route) for (const reason of new Set(Object.entries(TRIP_ONLY_SWITCHES).filter(([key, rule]) => data[key] !== rule.off).map(([, rule]) => rule.reason))) problems.push(`${name} ${reason}, so it needs a route`);
  problems.push(...exploreProblems(data.explore, name));
  if (problems.length > 0) return problems;
  return mapStyleProblems(styleOf()).map((problem) => `${name}: ${problem}`);
}

export function storyProblems(story, theme) {
  if (!Array.isArray(story?.steps) || story.steps.length === 0) return ['The story needs at least one step'];
  if ('styles' in story) return ['The story carries no styles; every step uses the app theme'];
  if ('sources' in story) return ['The story carries no sources line; the Methodology credits every dataset'];
  const introProblems = INTRO_TEXTS.every((key) => isText(story.intro?.[key])) ? [] : [`The story needs an intro with ${INTRO_TEXTS.join(', ')} (any can be empty)`];
  const closingProblems = isText(story.closing) ? [] : ['The story needs closing words before the map button (they can be empty)'];
  const mapProblems = story.map ? stepProblems(story.map, 'The map page', () => mapPageMapStyle(theme, story), story) : ['The story needs a map page view'];
  if (story.map?.route) mapProblems.push('The map page cannot fix one trip');
  if (story.map && story.map.chart !== null) mapProblems.push('The map page always shows the map, so its chart must be null');
  return [...introProblems, ...closingProblems, ...mapProblems, ...story.steps.flatMap((data, index) => stepProblems(data, `Step ${index + 1}`, () => stepMapStyle(index + 1, theme, story), story)), ...groceryRunProblems(story.groceryRun)];
}
