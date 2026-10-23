import { param, CALIBRATION } from '../../method.js';
import { SCENARIO_TRANSIT_THRESHOLDS_MIN } from '../../audit.js';
import { cellAreaSqMi } from '../../surface.js';
import { clockWords } from '../../language.js';
import { METHODOLOGY_DEFINITION } from './methodology_definition.js';

const wholeNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const tenths = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const toTwoFigures = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 2 });
const toThreeFigures = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 });
const FEET_PER_MILE = 5280;
const MINUTES_IN_AN_HOUR = 60;

const oneDecimal = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const asWritten = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const YARDS_PER_MILE = 1760;

function shareWords(part, whole) {
  return tenths.format((part / whole) * 100);
}

function timeOfDayParts(minutesAfterMidnight, showMinutes) {
  const [time, meridiem] = clockWords(minutesAfterMidnight).split(' ');
  return { time: showMinutes ? time : time.replace(':00', ''), meridiem: meridiem.toUpperCase() };
}

function timeWindowWords([startMinutes, endMinutes], { showMinutes }) {
  const start = timeOfDayParts(startMinutes, showMinutes);
  const end = timeOfDayParts(endMinutes, showMinutes);
  if (start.meridiem === end.meridiem) return `${start.time}–${end.time} ${end.meridiem}`;
  return `${start.time} ${start.meridiem}–${end.time} ${end.meridiem}`;
}

export const METHODOLOGY_LINKS = Object.freeze({
  foodAccessMap: 'https://mvrpc.maps.arcgis.com/apps/instant/sidebar/index.html?appid=8d43d8c2d1b04533a1e4693a100523f2',
  coalition: 'https://www.mcohio.org/1504/Food-Equity-Coalition',
  acs: 'https://www.census.gov/programs-surveys/acs',
  decennial: 'https://www.census.gov/programs-surveys/decennial-census.html',
  usdaAtlas: 'https://www.ers.usda.gov/data-products/food-access-research-atlas/',
  mvrpcAccessibility: 'https://www.mvrpc.org/sites/default/files/accessibility_analysis_final-web.pdf',
  rta: 'https://www.iriderta.org/',
  gtfs: 'https://proc.greaterdaytonrta.org/gtfs/google_transit.zip',
  osm: 'https://www.openstreetmap.org/',
  googleRoutes: 'https://developers.google.com/maps/documentation/routes',
  nominatim: 'https://nominatim.org/',
  maplibre: 'https://maplibre.org/',
  pmtiles: 'https://protomaps.com/',
  goPmtiles: 'https://github.com/protomaps/go-pmtiles',
  protomapsBasemaps: 'https://github.com/protomaps/basemaps',
  repositorySnapshots: 'https://github.com/ericmrothman/grocery-lines/tree/main/snapshots',
  repositoryNotebooks: 'https://github.com/ericmrothman/grocery-lines/tree/main/notebooks',
  notebookSources: 'https://github.com/ericmrothman/grocery-lines/blob/main/notebooks/01_sources_and_food_places.ipynb',
  notebookHexagons: 'https://github.com/ericmrothman/grocery-lines/blob/main/notebooks/02_hexagons_and_households.ipynb',
  notebookTrips: 'https://github.com/ericmrothman/grocery-lines/blob/main/notebooks/03_trips_and_calibration.ipynb',
  notebookHighNeed: 'https://github.com/ericmrothman/grocery-lines/blob/main/notebooks/04_high_need_and_sensitivity.ipynb',
  python: 'https://www.python.org/',
  node: 'https://nodejs.org/',
  jupyter: 'https://jupyter.org/',
});

const millionsWords = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const TRAVEL_COMBINATIONS = Object.freeze(['driving', 'walking', 'the bus at rush hour', 'the bus at midday']);
const FOOD_PLACES = Object.freeze({ supermarkets: 45, pantries: 73, otherRetailers: 430 });
const FIGURE = /\{([A-Za-z][A-Za-z0-9]*)\}/g;
const LINK = /\[([^\]]*)\]\(([^)\s]*)\)/g;

const walkMinutesPerMile = ({ setting }) => MINUTES_IN_AN_HOUR / setting('walkMph');
const oneMileWalkMinutes = (inputs) => walkMinutesPerMile(inputs) * inputs.setting('maxWalkMi');
const foodPlaces = () => FOOD_PLACES.supermarkets + FOOD_PLACES.pantries + FOOD_PLACES.otherRetailers;
const tripCalculations = ({ grid }) => grid.hexagons * foodPlaces() * TRAVEL_COMBINATIONS.length;
const lineCounts = ({ setting, sensitivity }) => sensitivity.rows.find((row) => row.carlessPct === setting('desertCarlessPct')).byLine.map((cell) => cell.hexagons);

export const METHODOLOGY_FIGURES = Object.freeze({
  walkMph: { words: 'Walking pace, mph', value: ({ setting }) => oneDecimal.format(setting('walkMph')) },
  walkMinutesPerMile: { words: 'Minutes to walk a mile', value: (inputs) => asWritten.format(walkMinutesPerMile(inputs)) },
  maxWalkMi: { words: 'Longest walk that counts as a grocery trip, miles', value: ({ setting }) => oneDecimal.format(setting('maxWalkMi')) },
  oneMileWalkMinutes: { words: 'Minutes to walk the USDA mile', value: (inputs) => asWritten.format(oneMileWalkMinutes(inputs)) },
  hexagonWalkMinutes: { words: 'Minutes to walk across a hexagon', value: (inputs) => asWritten.format(inputs.setting('cellSizeMi') * walkMinutesPerMile(inputs)) },
  catchmentMi: { words: 'Longest walk to a bus stop, miles', value: ({ setting }) => asWritten.format(setting('catchmentMi')) },
  catchmentWalkMinutes: { words: 'Minutes to walk to the farthest bus stop', value: (inputs) => asWritten.format(inputs.setting('catchmentMi') * walkMinutesPerMile(inputs)) },
  transferBufferMin: { words: 'Minutes allowed at every transfer', value: ({ setting }) => asWritten.format(setting('minConnectionMin')) },
  shortestRideMi: { words: 'Shortest bus ride counted, miles', value: ({ setting }) => asWritten.format(setting('shortestRideMi')) },
  departureStepMin: { words: 'Minutes between sampled departures', value: ({ setting }) => String(setting('departureStepMin')) },
  rushHourWindow: { words: 'Rush-hour departures, e.g. 6:00–9:00 AM', value: ({ setting }) => timeWindowWords(setting('rushHourDeparturesMin'), { showMinutes: true }) },
  middayWindow: { words: 'Midday departures, e.g. 10:00 AM–2:00 PM', value: ({ setting }) => timeWindowWords(setting('middayDeparturesMin'), { showMinutes: true }) },
  rushHourHours: { words: 'Rush-hour departures, e.g. 6–9 AM', value: ({ setting }) => timeWindowWords(setting('rushHourDeparturesMin'), { showMinutes: false }) },
  middayHours: { words: 'Midday departures, e.g. 10 AM–2 PM', value: ({ setting }) => timeWindowWords(setting('middayDeparturesMin'), { showMinutes: false }) },
  localMph: { words: 'Speed on residential streets, mph', value: ({ setting }) => String(setting('localMph')) },
  motorwayMph: { words: 'Speed on highways, mph', value: ({ setting }) => String(setting('motorwayMph')) },
  parkingMin: { words: 'Minutes to park and walk in', value: ({ setting }) => asWritten.format(setting('parkingMin')) },
  busLineMin: { words: 'The bus line, minutes one way', value: ({ setting }) => String(setting('desertTransitMin')) },
  busLineMarginMin: { words: 'The bus line minus the USDA mile on foot, minutes', value: (inputs) => asWritten.format(inputs.setting('desertTransitMin') - oneMileWalkMinutes(inputs)) },
  busLineRoundTripMin: { words: 'Two bus trips at the line, minutes', value: ({ setting }) => String(2 * setting('desertTransitMin')) },
  fewestBusLineMin: { words: 'Shortest bus line offered in Map Options, minutes', value: () => String(Math.min(...SCENARIO_TRANSIT_THRESHOLDS_MIN)) },
  mostBusLineMin: { words: 'Longest bus line offered in Map Options, minutes', value: () => String(Math.max(...SCENARIO_TRANSIT_THRESHOLDS_MIN)) },
  carlessLinePct: { words: 'The car-ownership line, % of households without a car', value: ({ setting }) => String(setting('desertCarlessPct')) },
  countyCarlessPct: { words: 'Share of county households without a car, %', value: ({ facts }) => shareWords(facts.county.carlessHouseholds, facts.county.households) },
  livedInLineHouseholdsPerSqMi: { words: 'Households per square mile for a hexagon to count as lived in', value: ({ setting }) => wholeNumber.format(setting('maskHouseholdsPerSqMi')) },
  homesPerHexagon: { words: 'Homes in one hexagon at that line', value: ({ setting, method }) => wholeNumber.format(setting('maskHouseholdsPerSqMi') * cellAreaSqMi(method)) },
  countyHexagons: { words: 'Hexagons covering the county', value: ({ grid }) => wholeNumber.format(grid.hexagons) },
  livedInHexagons: { words: 'Lived-in hexagons', value: ({ grid }) => wholeNumber.format(grid.livedIn) },
  highNeedHexagons: { words: 'High-need hexagons', value: ({ highNeed }) => wholeNumber.format(highNeed.hexagons) },
  highNeedCarlessHouseholds: { words: 'Carless households in them, to two figures', value: ({ highNeed }) => toTwoFigures.format(highNeed.carlessHouseholds) },
  highNeedInEveryCombination: { words: 'High-need hexagons under all nine lines', value: ({ sensitivity }) => wholeNumber.format(sensitivity.inEvery) },
  middayHighNeedHexagons: { words: 'High-need hexagons at midday', value: ({ sensitivity }) => wholeNumber.format(sensitivity.midday) },
  busLineSwingPct: { words: 'Change in the count from moving the bus line five minutes, %', value: (inputs) => {
    const [below, at, above] = lineCounts(inputs);
    return wholeNumber.format((Math.max(below - at, at - above) / at) * 100);
  } },
  supermarkets: { words: 'Supermarkets', value: () => String(FOOD_PLACES.supermarkets) },
  pantries: { words: 'Food pantries', value: () => String(FOOD_PLACES.pantries) },
  otherRetailers: { words: 'Other food retailers', value: () => String(FOOD_PLACES.otherRetailers) },
  licensedRetailers: { words: 'Supermarkets and other food retailers together', value: () => String(FOOD_PLACES.supermarkets + FOOD_PLACES.otherRetailers) },
  foodPlaces: { words: 'All food places', value: () => wholeNumber.format(foodPlaces()) },
  travelCombinations: { words: 'Ways of traveling timed', value: () => String(TRAVEL_COMBINATIONS.length) },
  tripCalculations: { words: 'Trip calculations, e.g. 18.8 million', value: (inputs) => `${millionsWords.format(tripCalculations(inputs) / 1e6)} million` },
  medianDriveMinutes: { words: 'Median drive to a supermarket from a lived-in hexagon, minutes', value: ({ grid }) => oneDecimal.format(grid.medianDriveMin) },
  blockGroups: { words: 'Census block groups', value: ({ blockGroups }) => wholeNumber.format(blockGroups) },
  busRoutes: { words: 'Bus routes the map times', value: ({ transit }) => wholeNumber.format(transit.routes) },
  busStops: { words: 'Bus stops the map times', value: ({ transit }) => wholeNumber.format(transit.stops) },
  benchmarkTrips: { words: 'Google benchmark trips', value: () => String(CALIBRATION.benchmarkTrips) },
  benchmarkWalks: { words: 'Google benchmark walks', value: () => String(CALIBRATION.walkDistanceRoutes) },
  driveWithinSeconds: { words: 'Driving within Google by, seconds', value: () => wholeNumber.format(CALIBRATION.driveMedianAbsMin * 60) },
  driveWithinMinutes: { words: 'Driving within Google by, minutes', value: () => oneDecimal.format(CALIBRATION.driveMedianAbsMin) },
  busArrivalWithinMinutes: { words: 'Bus arrival within Google by, minutes', value: () => oneDecimal.format(CALIBRATION.transitArrivalMedianAbsMin) },
  walkWithinFeet: { words: 'Walks within Google by, feet', value: () => wholeNumber.format(CALIBRATION.walkDistanceMedianAbsMi * FEET_PER_MILE) },
  googleWalkMph: { words: 'Google walking pace, mph', value: () => oneDecimal.format(CALIBRATION.googleWalkMph) },
  privacyRadiusYards: { words: 'Farthest a shared start moves, yards', value: ({ setting }) => toTwoFigures.format((setting('cellSizeMi') / Math.sqrt(3)) * YARDS_PER_MILE) },
});

export const SENSITIVITY_TABLE_FIGURES = Object.freeze({
  column: Object.freeze(['lineMin']),
  row: Object.freeze(['carlessPct']),
  cell: Object.freeze(['hexagons', 'households']),
});

export function figureNames(text) {
  return [...text.matchAll(FIGURE)].map((match) => match[1]);
}

export function linkTargets(text) {
  return [...text.matchAll(LINK)].map((match) => ({ label: match[1], target: match[2] }));
}

function filled(text, figures) {
  return text.replace(FIGURE, (match, name) => figures[name] ?? match).replace(LINK, (match, label, target) => `[${label}](${METHODOLOGY_LINKS[target] ?? target})`);
}

function sensitivityTable(block, { setting, sensitivity }, figures) {
  const isPublished = (row, cell) => row.carlessPct === setting('desertCarlessPct') && cell.lineMin === setting('desertTransitMin');
  const cellWords = (row, cell) => {
    const words = filled(block.cell, { ...figures, hexagons: wholeNumber.format(cell.hexagons), households: toThreeFigures.format(cell.households) });
    return isPublished(row, cell) ? `**${words}**` : words;
  };
  return {
    kind: 'table',
    columns: [filled(block.corner, figures), ...sensitivity.lines.map((lineMin) => filled(block.column, { ...figures, lineMin: String(lineMin) }))],
    rows: sensitivity.rows.map((row) => [filled(block.row, { ...figures, carlessPct: String(row.carlessPct) }), ...row.byLine.map((cell) => cellWords(row, cell))]),
  };
}

const TABLE_TAG = /^<SensitivityTable\s([\s\S]*?)\/>$/;
const TAG = /<[A-Za-z][^>]*>/g;
const ATTRIBUTE = /([A-Za-z]+)="([^"]*)"/g;
const BULLET = /^- /;
const NUMBERED = /^\d+\. /;

export function markdownTags(markdown) {
  return [...markdown.matchAll(TAG)].map((match) => {
    const table = match[0].match(TABLE_TAG);
    return { tag: match[0], isTable: Boolean(table), attributes: table ? Object.fromEntries([...table[1].matchAll(ATTRIBUTE)].map((attribute) => [attribute[1], attribute[2]])) : {} };
  });
}

function listItems(lines, marker) {
  const items = [];
  for (const line of lines) {
    if (marker.test(line)) items.push(line.replace(marker, ''));
    else items[items.length - 1] += ` ${line.trim()}`;
  }
  return items;
}

export function markdownBlocks(markdown) {
  const chunks = markdown.replace(/\r/g, '').split(/\n\s*\n/).map((chunk) => chunk.trim()).filter(Boolean);
  return chunks.flatMap((chunk) => {
    const lines = chunk.split('\n').map((line) => line.trimEnd());
    if (lines[0].startsWith('### ')) {
      const rest = lines.slice(1).join('\n').trim();
      return [{ kind: 'subheading', text: lines[0].slice(4).trim() }, ...(rest ? markdownBlocks(rest) : [])];
    }
    if (chunk.startsWith('<')) return markdownTags(chunk).map((tag) => (tag.isTable ? { kind: 'sensitivityTable', ...tag.attributes } : { kind: 'paragraph', text: tag.tag }));
    if (BULLET.test(lines[0])) return [{ kind: 'bulletList', items: listItems(lines, BULLET) }];
    if (NUMBERED.test(lines[0])) return [{ kind: 'numberedList', start: Number.parseInt(lines[0], 10), items: listItems(lines, NUMBERED) }];
    return [{ kind: 'paragraph', text: lines.map((line) => line.trim()).join(' ') }];
  });
}

function compiledBlock(block, inputs, figures) {
  if (block.kind === 'sensitivityTable') return sensitivityTable(block, inputs, figures);
  if (block.items) return { ...block, items: block.items.map((item) => filled(item, figures)) };
  return { ...block, text: filled(block.text, figures) };
}

function figureInputs(method, inputs) {
  return { ...inputs, method, setting: (name) => param(method, name) };
}

function figuresFrom(inputs) {
  return Object.fromEntries(Object.entries(METHODOLOGY_FIGURES).map(([name, figure]) => [name, figure.value(inputs)]));
}

export function methodologyFigures(method, inputs) {
  return figuresFrom(figureInputs(method, inputs));
}

export function methodologyWords(method, inputs, definition = METHODOLOGY_DEFINITION) {
  const figureSources = figureInputs(method, inputs);
  const figures = figuresFrom(figureSources);
  return {
    back: filled(definition.back, figures),
    returnToMap: filled(definition.returnToMap, figures),
    title: filled(definition.title, figures),
    introduction: markdownBlocks(definition.introduction).map((block) => filled(block.text ?? '', figures)),
    sections: definition.sections.map((section) => ({
      sectionId: section.sectionId,
      heading: filled(section.heading, figures),
      blocks: markdownBlocks(section.markdown).map((block) => compiledBlock(block, figureSources, figures)),
    })),
  };
}
