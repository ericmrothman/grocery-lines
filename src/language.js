import { param } from './method.js';
import { wholeMinutes } from './rounding.js';

const DISPARITY_BAND_WORDS = Object.freeze({
  'short-trip': (method) => `Local Access (under ${param(method, 'shortTripDriveMin')} min to drive)`,
  parity: (method) => `Equitable (under ${param(method, 'strainedRatio')}× the drive)`,
  strained: (method) => `Moderate Transit Gap (${param(method, 'strainedRatio')}×–${param(method, 'severeRatio')}× the drive)`,
  severe: (method) => `Severe Transit Gap (${param(method, 'severeRatio')}× the drive or more)`,
  'no-bus-trip': () => 'No Transit Route Available',
});

const hundredthsForDisplay = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, useGrouping: false });

function displayMiles(miles) {
  return hundredthsForDisplay.format(miles);
}

export function unknownWord(kind, value) {
  throw new Error(`No words for ${kind}: ${value}`);
}

const BAY_SUFFIX = / - [NSEW]\.B\.$/;

function periodWords(period) {
  return period === 'offPeak' ? 'midday' : 'rush-hour';
}

const AT_SIGN_IN_STOP_NAMES = / @ /g;

export function stationWords(stopName) {
  return stopName.replace(BAY_SUFFIX, '').replace(AT_SIGN_IN_STOP_NAMES, ' & ');
}

function transferLabel(component) {
  if (!component.toRoute) return `Change at ${stationWords(component.place)}`;
  const changesStop = component.fromStop && stationWords(component.fromStop) !== stationWords(component.place);
  const where = changesStop ? ` at ${stationWords(component.place)}` : '';
  return `Change to ${component.toRoute}${where}`;
}

export function componentLabel(component) {
  switch (component.kind) {
    case 'drive': return 'Drive';
    case 'park': return 'Park';
    case 'walk-to-stop': return `Walk to ${component.stopName ? stationWords(component.stopName) : `${component.route}`}`;
    case 'walk-to-destination': return 'Walk to destination';
    case 'walk-whole-way': return 'Walk there';
    case 'wait': return `Wait for ${component.route}`;
    case 'ride': return `Ride to ${stationWords(component.toStop)}`;
    case 'transfer': return transferLabel(component);
    default: return unknownWord('component kind', component.kind);
  }
}

const TURN_GLYPHS = Object.freeze({
  start: '↑', straight: '↑', 'slight-left': '↰', left: '↰', 'slight-right': '↱', right: '↱', 'u-turn': '↶', arrive: '•',
});
const TURN_PHRASES = Object.freeze({
  straight: 'Continue onto', 'slight-left': 'Bear left onto', left: 'Turn left onto', 'slight-right': 'Bear right onto', right: 'Turn right onto', 'u-turn': 'Make a U-turn onto',
});
const UNNAMED_ROAD_WORDS = Object.freeze({ footpath: 'a footpath', 'service-road': 'a service road', ramp: 'a ramp', street: 'an unnamed street' });
const STREET_TYPE_ABBREVIATIONS = Object.freeze({
  Avenue: 'Ave', Boulevard: 'Blvd', Circle: 'Cir', Court: 'Ct', Drive: 'Dr', Highway: 'Hwy', Lane: 'Ln',
  Parkway: 'Pkwy', Place: 'Pl', Road: 'Rd', Street: 'St', Terrace: 'Ter', Trail: 'Trl',
});
const DIRECTION_ABBREVIATIONS = Object.freeze({ North: 'N', South: 'S', East: 'E', West: 'W' });

export function streetNameWords(name) {
  const words = name.split(' ');
  if (words.length < 2) return name;
  const first = words.length > 2 ? DIRECTION_ABBREVIATIONS[words[0]] ?? words[0] : words[0];
  const last = STREET_TYPE_ABBREVIATIONS[words.at(-1)] ?? words.at(-1);
  return [first, ...words.slice(1, -1), last].join(' ');
}
const COMPASS_POINTS = Object.freeze(['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']);
const DEGREES_PER_COMPASS_POINT = 360 / COMPASS_POINTS.length;
const averageMph = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function compassWords(degrees) {
  return COMPASS_POINTS[Math.trunc((((degrees + DEGREES_PER_COMPASS_POINT / 2) % 360) + 360) % 360 / DEGREES_PER_COMPASS_POINT)];
}

export function turnGlyph(turn) {
  return TURN_GLYPHS[turn] ?? unknownWord('turn', turn);
}

function roadWords(maneuver) {
  if (maneuver.streetName) return streetNameWords(maneuver.streetName);
  return UNNAMED_ROAD_WORDS[maneuver.roadKind] ?? unknownWord('unnamed road kind', maneuver.roadKind);
}

export function arrivalWords(component, placeName) {
  if (component.kind === 'walk-to-stop' && component.stopName) return stationWords(component.stopName);
  return placeName;
}

export function maneuverWords(maneuver, arrivingAt) {
  if (maneuver.turn === 'arrive') return arrivingAt ? `Arrive at ${arrivingAt}` : 'Arrive';
  if (maneuver.turn === 'start') return `Head ${compassWords(maneuver.headingDegrees)} on ${roadWords(maneuver)}`;
  const phrase = TURN_PHRASES[maneuver.turn] ?? unknownWord('turn', maneuver.turn);
  return `${phrase} ${roadWords(maneuver)}`;
}

export function maneuverBasisWords(maneuver, mode) {
  if (maneuver.turn === 'arrive' && maneuver.distanceMiles === 0) return null;
  const distance = `${displayMiles(maneuver.distanceMiles)} mi`;
  if (mode !== 'car' || maneuver.durationMinutes <= 0) return distance;
  return `${distance} · avg ${averageMph.format((maneuver.distanceMiles / maneuver.durationMinutes) * 60)} mph`;
}

function distanceBasis(component) {
  if (component.streetRouted) {
    if (component.kind === 'drive') return `${displayMiles(component.miles)} mi on streets, speeds by road type`;
    return `${displayMiles(component.miles)} mi`;
  }
  return `${displayMiles(component.miles)} mi (estimated)`;
}

const MINUTES_PER_DAY = 1440;
const MINUTES_IN_AN_HOUR = 60;
const HOURS_ON_A_CLOCK = 12;

export function clockWords(minutesAfterMidnight) {
  const minuteOfDay = wholeMinutes(minutesAfterMidnight) % MINUTES_PER_DAY;
  const hourOfDay = Math.trunc(minuteOfDay / MINUTES_IN_AN_HOUR);
  const minuteOfHour = minuteOfDay - hourOfDay * MINUTES_IN_AN_HOUR;
  const hourOnTheClock = hourOfDay % HOURS_ON_A_CLOCK === 0 ? HOURS_ON_A_CLOCK : hourOfDay % HOURS_ON_A_CLOCK;
  return `${hourOnTheClock}:${String(minuteOfHour).padStart(2, '0')} ${hourOfDay < HOURS_ON_A_CLOCK ? 'am' : 'pm'}`;
}

function waitBasis(component) {
  const departs = `Departs at ${clockWords(component.busLeavesAt)}`;
  const varies = variesWords(component.waitAcrossDepartures);
  return varies ? `${departs} · wait ${varies}` : departs;
}

const SHORTEST_WALK_WORTH_SAYING_MI = 0.01;

function transferBasis(component) {
  const departs = `Departs at ${clockWords(component.busLeavesAt)}`;
  if (component.walkMiles < SHORTEST_WALK_WORTH_SAYING_MI) return departs;
  return `${departs} after ${displayMiles(component.walkMiles)} mi walk from ${stationWords(component.fromStop)}`;
}

function scheduledRideBasis(component) {
  return `${displayMiles(component.miles)} mi · ${clockWords(component.departsAt)} – ${clockWords(component.arrivesAt)}`;
}

export function axisTickWords(minutes) {
  if (minutes === 0) return '0';
  const hours = Math.trunc(minutes / MINUTES_IN_AN_HOUR);
  const leftoverMinutes = minutes - hours * MINUTES_IN_AN_HOUR;
  if (hours === 0) return `${leftoverMinutes}m`;
  return leftoverMinutes === 0 ? `${hours}h` : `${hours}h ${leftoverMinutes}m`;
}

function compactMinutesRangeWords(fewestMinutes, mostMinutes) {
  const fewest = minutesWords(fewestMinutes);
  const most = minutesWords(mostMinutes);
  if (fewest === most) return fewest;
  const bothUnderAnHour = !fewest.includes('hr') && !most.includes('hr');
  return bothUnderAnHour ? `${fewest.replace(' min', '')}–${most}` : `${fewest}–${most}`;
}

export function busTransfersWords(routeNames) {
  const transferCount = routeNames.length - 1;
  if (transferCount === 0) return 'Direct';
  return `${transferCount} transfer${transferCount === 1 ? '' : 's'}`;
}

export function busRangeHeadingNote(fewestMinutes, mostMinutes) {
  if (minutesWords(fewestMinutes) === minutesWords(mostMinutes)) return null;
  return `varies by departure, ${compactMinutesRangeWords(fewestMinutes, mostMinutes)}`;
}

function variesWords(rangeAcrossDepartures) {
  if (!rangeAcrossDepartures) return null;
  const { fewest, most } = rangeAcrossDepartures;
  if (minutesWords(fewest) === minutesWords(most)) return null;
  if (minutesWords(fewest) === minutesWords(0)) return `varies up to ${minutesWords(most)}`;
  return `varies ${compactMinutesRangeWords(fewest, most)}`;
}

export function busRangeExplanationWords(fewestMinutes, mostMinutes) {
  return `Bus times vary from ${minutesRangeWords(fewestMinutes, mostMinutes)} with the departure; the median is shown. Show the bus trip.`;
}

export function minutesRangeWords(fewestMinutes, mostMinutes) {
  const fewest = minutesWords(fewestMinutes);
  const most = minutesWords(mostMinutes);
  return fewest === most ? fewest : `${fewest} – ${most}`;
}

export function componentBasis(component) {
  switch (component.kind) {
    case 'park': return 'fixed time to park and walk in';
    case 'wait': return waitBasis(component);
    case 'transfer': return transferBasis(component);
    case 'ride': return scheduledRideBasis(component);
    case 'drive':
    case 'walk-to-stop':
    case 'walk-to-destination':
    case 'walk-whole-way':
      return distanceBasis(component);
    default: return unknownWord('component kind', component.kind);
  }
}

export function walkOnlyReason(transitLeg) {
  if (!transitLeg.walkReason) return null;
  const reach = `${transitLeg.catchmentMi} mi`;
  switch (transitLeg.walkReason) {
    case 'walking-is-faster': return 'faster than the bus';
    case 'no-stop-near-start': return `no bus stop within ${reach} of the start`;
    case 'no-stop-near-destination': return `no bus stop within ${reach}`;
    case 'no-service-near-start': return `no ${periodWords(transitLeg.period)} buses near the start`;
    case 'no-service-near-destination': return `no ${periodWords(transitLeg.period)} buses near the place`;
    case 'not-connected': return 'no bus connects them';
    default: return unknownWord('walk reason', transitLeg.walkReason);
  }
}

function shortTripGapWords(gapMinutes) {
  if (gapMinutes === null || minutesWords(Math.max(gapMinutes, 0)) === minutesWords(0)) return 'bus is as fast as driving';
  return `bus takes ${minutesWords(gapMinutes)} longer than driving`;
}

export function disparityExplanationWords(disparityResult) {
  if (disparityResult.band === 'short-trip') return shortTripGapWords(disparityResult.gapMin);
  if (disparityResult.ratio === null) return null;
  return `the bus takes ${upToTenths.format(disparityResult.ratio)}× as long as driving`;
}

export function disparityBandWords(band, method) {
  const words = DISPARITY_BAND_WORDS[band];
  return words ? words(method) : unknownWord('disparity band', band);
}

const toTwoFigures = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 2 });
const wholeNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const FEET_PER_MILE = 5280;
const tenths = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const upToTenths = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

const FOOD_KIND_WORDS = Object.freeze({
  supermarket: 'Supermarket',
  pantry: 'Food pantry',
  'other-retailer': 'Other store',
});
const FOOD_KIND_PLURAL_WORDS = Object.freeze({
  supermarket: 'supermarkets',
  pantry: 'pantries',
  'other-retailer': 'other stores',
});

const MINUTES_PER_HOUR = 60;

export function minutesWords(minutes) {
  const shown = wholeMinutes(minutes);
  if (shown < MINUTES_PER_HOUR) return `${shown} min`;
  const hours = Math.trunc(shown / MINUTES_PER_HOUR);
  const minutesPastTheHour = shown - hours * MINUTES_PER_HOUR;
  return minutesPastTheHour === 0 ? `${hours} hr` : `${hours} hr ${minutesPastTheHour} min`;
}

export function noBusTripShortWords() {
  return 'no trip';
}

export function gapWords(disparityResult) {
  if (disparityResult.gapMin === null) return 'no bus trip';
  if (disparityResult.gapMin <= 0) return 'bus as fast';
  return `+${minutesWords(disparityResult.gapMin)}`;
}

export function foodKindWords(kind) {
  return FOOD_KIND_WORDS[kind] ?? unknownWord('food kind', kind);
}

export function foodKindPluralWords(kind) {
  return FOOD_KIND_PLURAL_WORDS[kind] ?? unknownWord('food kind', kind);
}

export function benefitsAcceptedWords({ acceptsSnap, acceptsWic }) {
  if (acceptsSnap && acceptsWic) return 'Accepts SNAP and WIC';
  if (acceptsSnap) return 'Accepts SNAP';
  if (acceptsWic) return 'Accepts WIC';
  return 'Doesn\'t accept SNAP or WIC';
}

export function storeTypeWords(storeType) {
  return storeType.toLowerCase().replace(/^[a-z]/, (firstLetter) => firstLetter.toUpperCase());
}

export function openStatusWords(status) {
  switch (status.state) {
    case 'open': return `Open until ${status.until}`;
    case 'closed': return 'Closed now';
    case 'unknown': return 'Call first';
    default: return unknownWord('open status', status.state);
  }
}

export function routeNumberWords(routeName) {
  return routeName.replace(/^Route /, '');
}

export function routeLineWords(drawnLine) {
  return drawnLine.mode === 'bus' ? routeNumberWords(drawnLine.route) : '';
}

export function placeHoverWords(place) {
  return { kind: place.kind, title: place.name, detail: place.address ?? null };
}

export function originWords(origin) {
  return { notice: origin.notice ? originNoticeWords(origin.notice) : null };
}

function originNoticeWords(notice) {
  switch (notice) {
    case 'outside-county': return 'That place is outside Montgomery County, so trips start from the northwest Dayton example.';
    case 'location-denied': return 'Your location is unavailable, so trips start from the northwest Dayton example.';
    default: return unknownWord('origin notice', notice);
  }
}

export function zipLookupWords(lookup) {
  switch (lookup.status) {
    case 'found': return `ZIP ${lookup.zip}`;
    case 'not-in-county': return `ZIP ${lookup.zip} is not in Montgomery County.`;
    case 'not-a-zip': return 'Enter a 5-digit ZIP.';
    default: return unknownWord('zip lookup', lookup.status);
  }
}


export function hiddenSelectionWords(placeName, kind) {
  return `Closed ${placeName}: ${foodKindPluralWords(kind)} are now hidden.`;
}

export function searchResultWords(result) {
  switch (result.status) {
    case 'found': return null;
    case 'empty': return 'Type an address, place or ZIP.';
    case 'not-in-county': return `${result.query} is not in Montgomery County.`;
    case 'no-match': return `No match for ${result.query} in Montgomery County. Try a street address or ZIP.`;
    case 'too-soon': return 'One search per second, please. Try again in a moment.';
    case 'failed': return 'Search is unreachable right now. Try a ZIP, or drag the START pin.';
    default: return unknownWord('search result', result.status);
  }
}

const LENS_UNITS = Object.freeze({ carless: '% carless' });
const LENSES_THAT_ALWAYS_HAVE_A_VALUE = Object.freeze(['car', 'walk', 'carless']);

function withUnit(text, unit) {
  return unit.startsWith('%') ? `${text}${unit}` : `${text} ${unit}`;
}

function inWholeMinutes(lens) {
  return !(lens in LENS_UNITS);
}

function bandTop(lens, upperBound) {
  return inWholeMinutes(lens) ? upperBound - 1 : upperBound;
}

export function lensBinWords(lens, upperBounds, binIndexValue, lowerBound = null) {
  const unit = LENS_UNITS[lens] ?? 'min';
  if (binIndexValue === 0) return withUnit(lowerBound === null ? `Under ${upperBounds[0]}` : `${lowerBound} to ${upperBounds[0]}`, unit);
  if (binIndexValue === upperBounds.length) {
    const last = upperBounds[upperBounds.length - 1];
    const over = inWholeMinutes(lens) ? `${withUnit(`${last}`, unit)} or more` : withUnit(`Over ${last}`, unit);
    return LENSES_THAT_ALWAYS_HAVE_A_VALUE.includes(lens) ? over : `${over}, or no bus trip`;
  }
  return withUnit(`${upperBounds[binIndexValue - 1]} to ${bandTop(lens, upperBounds[binIndexValue])}`, unit);
}

export function lensBinShortWords(lens, upperBounds, binIndexValue, lowerBound = null) {
  if (binIndexValue === 0) return lowerBound === null ? `<${upperBounds[0]}` : `${lowerBound}–${upperBounds[0]}`;
  if (binIndexValue === upperBounds.length) {
    const over = `${upperBounds[upperBounds.length - 1]}+`;
    return LENSES_THAT_ALWAYS_HAVE_A_VALUE.includes(lens) ? over : `${over} or none`;
  }
  return `${upperBounds[binIndexValue - 1]}–${bandTop(lens, upperBounds[binIndexValue])}`;
}

export function shortTripCarWords(shortTripDriveMinutes) {
  return `under ${shortTripDriveMinutes} min`;
}

export function surfaceMismatchWords() {
  return 'The travel-time map was built with a different method or data, so it is not shown. Trip cards are still worked out live.';
}



export function shownMinutesWords(shownMinutes) {
  return shownMinutes === 0 ? 'under 1 min' : minutesWords(shownMinutes);
}

const TRIP_PART_NAMES = Object.freeze({ walk: 'walking', wait: 'waiting', ride: 'riding', drive: 'driving', park: 'parking' });

export function tripPartWords(part, shownMinutes, rangeAcrossDepartures = null) {
  const name = TRIP_PART_NAMES[part] ?? unknownWord('trip part', part);
  const varies = rangeAcrossDepartures && minutesWords(rangeAcrossDepartures.fewest) !== minutesWords(rangeAcrossDepartures.most);
  if (varies) return `${compactMinutesRangeWords(rangeAcrossDepartures.fewest, rangeAcrossDepartures.most)} ${name}`;
  return `${shownMinutesWords(shownMinutes)} ${name}`;
}

function walkBetweenStopsWords(transfer) {
  const sameStation = stationWords(transfer.fromStop) === stationWords(transfer.place);
  const words = sameStation ? `Walk to the ${transfer.toRoute} stop` : `Walk to ${stationWords(transfer.place)}`;
  const basis = transfer.walkMiles < SHORTEST_WALK_WORTH_SAYING_MI
    ? `a few steps within ${stationWords(transfer.place)}`
    : `${displayMiles(transfer.walkMiles)} mi from ${stationWords(transfer.fromStop)}`;
  return { words, basis };
}

function waitToChangeWords(transfer) {
  return {
    words: transferLabel(transfer),
    basis: `Departs at ${clockWords(transfer.busLeavesAt)}`,
  };
}

export function pieceWords(piece, leg) {
  const component = piece.component;
  if (component.kind === 'transfer') return piece.part === 'walk' ? walkBetweenStopsWords(component) : waitToChangeWords(component);
  const label = componentLabel(component);
  const reason = component.kind === 'walk-whole-way' ? walkOnlyReason(leg) : null;
  return { words: reason ? `${label} (${reason})` : label, basis: componentBasis(component) };
}

const MODE_HEADING_WORDS = Object.freeze({ bus: 'Bus', car: 'Car', walk: 'Walking' });

export function modeHeadingWords(mode) {
  return MODE_HEADING_WORDS[mode] ?? unknownWord('travel mode', mode);
}

export function busNoTripWords(transitLeg) {
  return `No bus trip: ${walkOnlyReason(transitLeg)}`;
}

export function walkWinsWords() {
  return 'Walking is faster than the bus';
}

export function stepsToggleWords(open) {
  return open ? '▴ Hide steps' : '▾ See each step';
}

export function peekHintWords() {
  return 'Pull up for trip details';
}

export function focusBackWords(behind) {
  if (behind.kind === 'rest') return '✕ Close';
  return unknownWord('focus', behind.kind);
}

const STEP_NAME_WORDS = 6;

export function stepNameWords(step, copy) {
  const words = copy.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return `${step}. (no words yet)`;
  return `${step}. ${words.slice(0, STEP_NAME_WORDS).join(' ')}${words.length > STEP_NAME_WORDS ? '…' : ''}`;
}

const STEP_TAG_WORDS = Object.freeze({ breakBefore: 'Big numbers', chart: 'Chart', travel: '⬢ Travel time', carless: '⬢ Carless', pastLine: '⬢ Past the line', plain: '⬢ Plain', radius: '◯ Radius', route: 'One trip', busLines: 'Bus lines', lilaTracts: 'USDA tracts', annotation: 'Label' });

export function stepTagWords(tag) {
  return STEP_TAG_WORDS[tag] ?? unknownWord('step tag', tag);
}

export function storyProgressWords(step, total) {
  return `${step} of ${total}`;
}

const LOCKED_MODE_WORDS = Object.freeze({ bus: 'Bus', car: 'Drive' });
const KIND_COUNT_NOUNS = Object.freeze({ supermarket: ['supermarket', 'supermarkets'], pantry: ['pantry', 'pantries'], 'other-retailer': ['other store', 'other stores'] });

export function lockedTripWords(mapMode = 'bus') {
  const mode = LOCKED_MODE_WORDS[mapMode] ?? unknownWord('story trip', mapMode);
  return `${mode} · Supermarkets · Rush hour`;
}

export function pinCountWords(counts) {
  const parts = counts.map(({ kind, count }) => {
    const [one, many] = KIND_COUNT_NOUNS[kind] ?? unknownWord('food kind', kind);
    return `${wholeNumber.format(count)} ${count === 1 ? one : many}`;
  });
  return parts.join(' · ');
}

export function cellHoverWords({ households, carlessPct, highNeed = false }) {
  const homes = `${wholeNumber.format(households)} household${wholeNumber.format(households) === '1' ? '' : 's'}`;
  const words = carlessPct === null ? homes : `${homes} · ${wholeNumber.format(carlessPct)}% without a car`;
  return highNeed ? `High-need area · ${words}` : words;
}

const OVERLAY_KEY_WORDS = Object.freeze({
  highNeed: { full: 'High-need area', short: 'High-need' },
  lilaTracts: { full: 'USDA low-income, low-access tract', short: 'USDA tract' },
});

export function overlayKeyWords(overlay) {
  return OVERLAY_KEY_WORDS[overlay] ?? unknownWord('map key overlay', overlay);
}

export function pastLineKeyWords(transitLineMin) {
  return `${transitLineMin} min or more by bus to a supermarket at rush hour`;
}

export const COUNTY_FINDING_LABELS = Object.freeze({
  csvFileName: 'high-need-hexagons.csv',
});

export function countyFindingWords({ carlessHouseholds }, { lineMin }) {
  return {
    headline: `Across Montgomery County, roughly ${toTwoFigures.format(carlessHouseholds)} carless families face bus trips of ${lineMin} minutes or more to reach any supermarket.`,
  };
}

const TIME_OF_DAY_WORDS = Object.freeze({ peak: 'rush-hour', offPeak: 'midday' });

export function typicalTripWords({ highNeedOnly, noBusHexagons, period, parkingMin, walkMph }) {
  const time = TIME_OF_DAY_WORDS[period] ?? unknownWord('time of day', period);
  const noBus = noBusHexagons > 0 ? `; ${wholeNumber.format(noBusHexagons)} of these hexagons have no bus trip` : '';
  return {
    title: highNeedOnly ? 'High-need areas' : 'Montgomery County',
    meta: 'Median supermarket trip times',
    notes: {
      bus: `Median ${time} bus trip to the fastest-to-reach supermarket${noBus}.`,
      car: `Median drive on county streets, including ${parkingMin} min to park.`,
      walk: `Median walk on streets and paths at ${walkMph} mph.`,
    },
  };
}

export function mapInstructionWords() {
  return '**Click any hexagon** to see the shortest available supermarket trip. To change travel modes, open **map options**.';
}

export function cutoffOptionWords(minutes, standardMin) {
  return minutes === standardMin ? `${minutes} min (Standard)` : `${minutes} min`;
}

const GROCERY_PART_WORDS = Object.freeze({ walk: 'Walking', wait: 'Waiting', ride: 'On the bus', shop: 'Shopping', drive: 'Driving', park: 'Parking' });

export function groceryPartWords(part) {
  return GROCERY_PART_WORDS[part] ?? unknownWord('grocery run part', part);
}

export function groceryBlockWords(block) {
  const length = minutesWords(block.minutes);
  if (block.part === 'wait' && block.route) return `Waiting ${length} for the ${routeNumberWords(block.route)}${block.busLeavesAt === null ? '' : `, which leaves at ${clockWords(block.busLeavesAt)}`}`;
  if (block.part === 'ride' && block.route) return `On the ${routeNumberWords(block.route)} for ${length}`;
  return `${groceryPartWords(block.part)} ${length}`;
}

export function groceryExtraWords(extraMinutes) {
  return `+${minutesWords(extraMinutes)}`;
}

export function groceryCompareWords(part) {
  return part === 'drive' ? 'By car' : 'On foot';
}

const GROCERY_PHASE_WORDS = Object.freeze({ there: 'Trip there', store: 'Shopping', back: 'Trip home' });

export function groceryPhaseWords(phase) {
  return GROCERY_PHASE_WORDS[phase] ?? unknownWord('grocery run phase', phase);
}

export function groceryShoppingWords(shopMin) {
  return `${minutesWords(shopMin)} in the store`;
}

export function tripMilesWords(miles) {
  return `${toTwoFigures.format(miles)} mi`;
}

export function destinationNameWords(placeName) {
  return placeName.replace(/\s*#\d+$/, '');
}

export function destinationWords(placeName, straightLineMi) {
  return `${destinationNameWords(placeName)}, ${toTwoFigures.format(straightLineMi)} mi away`;
}

export function groceryDoorToDoorWords() {
  return 'Grocery trip total duration';
}

const MAP_CARD_MARK_WORDS = Object.freeze({ shortest: 'Shortest trip', median: 'Median trip', longest: 'Longest trip' });

export function mapCardMarkNameWords(kind) {
  return `${MAP_CARD_MARK_WORDS[kind] ?? unknownWord('map card mark', kind)}:`;
}

export function mapCardMarkWords(kind, minutes) {
  return `${mapCardMarkNameWords(kind)} ${minutesWords(minutes)}`;
}

export function groceryArrivalWords() {
  return 'Arrives at bus stop';
}

export function groceryDepartureHeadingWords(leaveAt) {
  return `${clockWords(leaveAt)} departure`;
}

export function groceryLeaveHomeWords(leaveAt) {
  return `Leave home at ${clockWords(leaveAt)}`;
}

export function groceryWaitingWords() {
  return 'Timing every trip on the bus schedule…';
}

export function groceryMissingWords() {
  return 'The bus schedule has no grocery run to show here.';
}

const GROCERY_STAGE_WORDS = Object.freeze({
  oneRun: 'Grocery run: one typical trip',
  everyDeparture: 'Grocery runs: every departure',
  quickestSlowest: 'Grocery runs: quickest and slowest',
  atTheStore: 'Grocery run: zoomed on the store and the bus home',
  missedBus: 'Grocery run: ten more minutes misses the bus',
  wholeTrip: 'Grocery run: both trips, whole length',
  allDay: 'Grocery runs: every departure, both shopping times',
  withCarAndFoot: 'Grocery runs: with car and walking',
});

export function groceryStageWords(stage) {
  return GROCERY_STAGE_WORDS[stage] ?? unknownWord('grocery chart stage', stage);
}

const GROCERY_PART_SHORT_WORDS = Object.freeze({ walk: 'Walk', wait: 'Wait', ride: 'Bus', shop: 'Shop', drive: 'Drive', park: 'Park' });

export function groceryPieceWords(block) {
  return `${GROCERY_PART_SHORT_WORDS[block.part] ?? groceryPartWords(block.part)} ${minutesWords(block.minutes)}`;
}

export function groceryDeparturesWords({ firstMin, lastMin, everyMin }, shopMin = null) {
  const leaving = `Leaving every ${minutesWords(everyMin)}, ${clockWords(firstMin)} to ${clockWords(lastMin)}`;
  return shopMin === null ? leaving : `${leaving}, with ${minutesWords(shopMin)} in the store`;
}

export function groceryBusLeavesWords(clockMin, isAhead) {
  return `${clockWords(clockMin)}${isAhead ? ' →' : ''}`;
}

export function groceryDepartureWords({ route, clockMin }, { isNext = false, isAhead = false } = {}) {
  if (!isNext) return `The ${routeNumberWords(route)} leaves ${clockWords(clockMin)}`;
  return `Next ${routeNumberWords(route)}: ${groceryBusLeavesWords(clockMin, isAhead)}`;
}

const MODE_BAR_WORDS = Object.freeze({ drive: 'Car', walk: 'Walk', bus: 'Bus' });

export function modeBarWords(mode) {
  return MODE_BAR_WORDS[mode] ?? unknownWord('mode bar', mode);
}

export function circleCardWords(card) {
  const { car, walk, bus } = card.minutes;
  const walking = walk === null ? 'no walking route' : `${wholeMinutes(walk)} min on foot`;
  const busing = bus === null ? 'no bus trip' : `${wholeMinutes(bus)} min by bus`;
  return `${card.name}, ${card.homeMiles} mi away: ${wholeMinutes(car)} min by car, ${walking}, ${busing}`;
}

export function circleGalleryWords(cardCount) {
  return `One mile around each of ${cardCount} supermarkets, with the drive, walk and bus from a home inside the circle`;
}
