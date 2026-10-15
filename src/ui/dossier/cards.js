import { openStatus } from '../../hours.js';
import {
  disparityBandWords,
  gapWords,
  minutesWords,
  openStatusWords,
  storeTypeWords,
  benefitsAcceptedWords,
  walkOnlyReason,
  noBusTripShortWords,
  busRangeHeadingNote, busTransfersWords, busRangeExplanationWords, disparityExplanationWords, axisTickWords,
  shownMinutesWords, tripPartWords, pieceWords, modeHeadingWords, busNoTripWords, walkWinsWords,
  shortTripCarWords,
  turnGlyph, maneuverWords, maneuverBasisWords, arrivalWords,
} from '../../language.js';
import { wholeMinutes } from '../../rounding.js';
import { param } from '../../method.js';
import { fastestTrips, timePieces } from '../../mobility.js';
import { legManeuvers } from '../../street_legs.js';

export const SHORTEST_BAR_SCALE_MINUTES = 60;

const SEVERITY_BY_BAND = Object.freeze({ 'short-trip': 'neutral', parity: 'plain', strained: 'plain', severe: 'alert', 'no-bus-trip': 'alert' });

export function barScaleMinutes(minutesToCompare) {
  return Math.max(SHORTEST_BAR_SCALE_MINUTES, ...minutesToCompare);
}

const AXIS_STEP_CHOICES_MINUTES = Object.freeze([15, 30, 60, 120, 180, 240, 360]);
const MOST_AXIS_STEPS = 3;

export function comparisonAxis(longestMinutes) {
  const stepMinutes = AXIS_STEP_CHOICES_MINUTES.find((step) => step * MOST_AXIS_STEPS >= longestMinutes) ?? AXIS_STEP_CHOICES_MINUTES.at(-1);
  let stepCount = 1;
  while (stepCount * stepMinutes < longestMinutes) stepCount += 1;
  const scaleMinutes = stepCount * stepMinutes;
  const ticks = Array.from({ length: stepCount + 1 }, (unused, index) => {
    const minutes = index * stepMinutes;
    return { minutes, percent: (minutes / scaleMinutes) * 100, words: axisTickWords(minutes) };
  });
  return { scaleMinutes, ticks };
}

export function comparisonBar(mode, minutes, scaleMinutes = SHORTEST_BAR_SCALE_MINUTES) {
  return {
    mode,
    minutes,
    widthPercent: (minutes / scaleMinutes) * 100,
    minutesText: minutesWords(minutes),
  };
}



const PHONE_NUMBER_PATTERN = /\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}/;

export function phoneLink(phoneText) {
  const match = PHONE_NUMBER_PATTERN.exec(phoneText ?? '');
  if (!match) return null;
  return { label: match[0], href: `tel:+1${match[0].replace(/\D/g, '')}` };
}

function openStatusModel(place, instant) {
  if (place.kind !== 'pantry') return null;
  const status = openStatus(place.hoursText, instant);
  return {
    state: status.state,
    words: status.state === 'unknown' ? null : openStatusWords(status),
    rawHours: status.state === 'unknown' ? status.raw : null,
  };
}

function tripAxis(trip) {
  return comparisonAxis(barScaleMinutes([trip.drive.totalMin, trip.bus?.departures.worstMin ?? 0, trip.walk.totalMin]));
}

function tripBarScaleMinutes(trip) {
  return tripAxis(trip).scaleMinutes;
}

function carBar(trip, method) {
  const bar = comparisonBar('car', trip.drive.totalMin, tripBarScaleMinutes(trip));
  if (trip.disparity.band !== 'short-trip') return bar;
  return { ...bar, minutesText: shortTripCarWords(param(method, 'shortTripDriveMin')) };
}

function hasTransitTrip(trip) {
  return trip.transit.kind !== 'none';
}

function busBar(trip) {
  if (!trip.bus) return { mode: 'bus', minutes: null, widthPercent: 0, minutesText: noBusTripShortWords(), missing: true };
  const scaleMinutes = tripBarScaleMinutes(trip);
  const { bestMin, worstMin } = trip.bus.departures;
  const percentOfScale = (minutes) => (minutes / scaleMinutes) * 100;
  return {
    ...comparisonBar('bus', trip.bus.totalMin, scaleMinutes),
    range: { fromPercent: percentOfScale(bestMin), toPercent: percentOfScale(worstMin) },
    minutesText: minutesWords(trip.bus.totalMin),
    hasRange: true,
    spokenMinutesText: minutesWords(trip.bus.totalMin),
    rangeExplanation: busRangeExplanationWords(bestMin, worstMin),
  };
}

function quickPart(mode, text) {
  return { mode, text, spokenText: `${modeHeadingWords(mode)} ${text}` };
}

const PIECE_ICONS = Object.freeze({ drive: 'car', park: 'park', 'walk-to-stop': 'walk', 'walk-to-destination': 'walk', 'walk-whole-way': 'walk', wait: 'wait', ride: 'bus' });

export function pieceIcon(piece) {
  if (piece.component.kind === 'transfer') return piece.part === 'walk' ? 'walk' : 'transfer';
  return PIECE_ICONS[piece.component.kind];
}

function quickParts(trip, car, rankedBy) {
  const carPart = quickPart('car', car.minutesText);
  const walkWholeWay = quickPart('walk', minutesWords(trip.walk.totalMin));
  const gap = { mode: 'gap', text: gapWords(trip.disparity), spokenText: gapWords(trip.disparity) };
  if (!hasTransitTrip(trip)) return rankedBy === 'walk' ? [walkWholeWay, carPart, gap] : [carPart, gap, walkWholeWay];
  const tripMode = trip.transit.kind === 'walk' ? 'walk' : 'bus';
  const transitPart = quickPart(tripMode, minutesWords(trip.transit.totalMin));
  if (rankedBy === 'walk') return tripMode === 'walk' ? [transitPart, carPart] : [walkWholeWay, carPart, transitPart];
  return [carPart, transitPart, gap];
}

export function allotWholeMinutes(pieces, totalMinutes) {
  const shownTotal = wholeMinutes(totalMinutes);
  const wholeParts = pieces.map((piece) => Math.trunc(piece.minutes));
  let minutesLeftToGive = shownTotal - wholeParts.reduce((sum, minutes) => sum + minutes, 0);
  const largestRemaindersFirst = pieces
    .map((piece, index) => ({ index, remainder: piece.minutes - wholeParts[index] }))
    .sort((larger, smaller) => smaller.remainder - larger.remainder || larger.index - smaller.index);
  const shown = [...wholeParts];
  for (const { index } of largestRemaindersFirst) {
    if (minutesLeftToGive <= 0) break;
    shown[index] += 1;
    minutesLeftToGive -= 1;
  }
  return shown;
}

function partsInFirstAppearanceOrder(pieces, waitingAcrossDepartures) {
  const parts = [...new Set(pieces.map((piece) => piece.part))];
  return parts.map((part) => {
    const shownMinutes = pieces.filter((piece) => piece.part === part).reduce((sum, piece) => sum + piece.shownMinutes, 0);
    return { part, text: tripPartWords(part, shownMinutes, part === 'wait' ? waitingAcrossDepartures : null) };
  });
}

const NO_DIRECTIONS = Object.freeze({ streets: null, method: null, placeName: null });

export function maneuverSteps(component, shownMinutes, { streets, method, placeName }) {
  if (!streets || component.kind === 'transfer') return [];
  const maneuvers = legManeuvers(streets, component, method);
  if (!maneuvers || maneuvers.length < 2) return [];
  const travelMode = component.kind === 'drive' ? 'car' : 'walk';
  const shown = allotWholeMinutes(maneuvers.map((maneuver) => ({ minutes: maneuver.durationMinutes })), shownMinutes);
  return maneuvers.map((maneuver, index) => {
    const arriving = maneuver.turn === 'arrive';
    return {
      glyph: turnGlyph(maneuver.turn),
      instruction: maneuverWords(maneuver, arriving ? arrivalWords(component, placeName) : null),
      streetName: maneuver.streetName,
      distanceMiles: maneuver.distanceMiles,
      durationMinutes: maneuver.durationMinutes,
      shownMinutes: shown[index],
      shownText: arriving && maneuver.durationMinutes === 0 ? null : shownMinutesWords(shown[index]),
      basis: maneuverBasisWords(maneuver, travelMode),
    };
  });
}

function breakdownOfLeg(mode, leg, totalText, headingNote, waitingAcrossDepartures = null, directions = NO_DIRECTIONS) {
  const pieces = timePieces(leg);
  const shown = allotWholeMinutes(pieces, leg.totalMin);
  const pieceViews = pieces.map((piece, index) => ({
    part: piece.part,
    minutes: piece.minutes,
    shownMinutes: shown[index],
    shownText: shownMinutesWords(shown[index]),
    route: piece.route,
    icon: pieceIcon(piece),
    ...pieceWords(piece, leg),
    assumed: piece.component.assumed === true,
    maneuvers: piece.part === 'walk' || piece.part === 'drive' ? maneuverSteps(piece.component, shown[index], directions) : [],
  }));
  const hasSteps = pieceViews.length > 1 || pieceViews.some((piece) => piece.maneuvers.length > 0);
  return {
    mode,
    heading: modeHeadingWords(mode),
    headingDetail: null,
    totalText,
    headingNote,
    noTripText: null,
    walkWinsNote: null,
    pieces: pieceViews,
    key: pieceViews.length > 1 ? partsInFirstAppearanceOrder(pieceViews, waitingAcrossDepartures) : [],
    hasSteps,
    stepsTotalText: shownMinutesWords(shown.reduce((sum, minutes) => sum + minutes, 0)),
  };
}

function busBreakdown(trip, busBarModel, directions) {
  if (!trip.bus) {
    return { mode: 'bus', heading: modeHeadingWords('bus'), headingDetail: null, totalText: busBarModel.minutesText, headingNote: null, noTripText: busNoTripWords(trip.transit), walkWinsNote: null, pieces: [], key: [], hasSteps: false, stepsTotalText: null };
  }
  const { bestMin, worstMin, waitingMin } = trip.bus.departures;
  const breakdown = breakdownOfLeg('bus', trip.bus, minutesWords(trip.bus.totalMin), busRangeHeadingNote(bestMin, worstMin), waitingMin, directions);
  return { ...breakdown, headingDetail: busTransfersWords(trip.bus.routes), walkWinsNote: trip.transit.kind === 'walk' ? walkWinsWords() : null };
}

function modeBreakdowns(trip, [carBarModel, busBarModel, walkBarModel], directions) {
  const walkHeadingNote = componentBasisOfOnlyComponent(trip.walk);
  return [
    busBreakdown(trip, busBarModel, directions),
    breakdownOfLeg('car', trip.drive, carBarModel.minutesText, null, null, directions),
    breakdownOfLeg('walk', trip.walk, walkBarModel.minutesText, walkHeadingNote, null, directions),
  ];
}

function componentBasisOfOnlyComponent(leg) {
  return pieceWords(timePieces(leg)[0], leg).basis;
}

export function tripBars(trip, method) {
  return {
    bars: [carBar(trip, method), busBar(trip), comparisonBar('walk', trip.walk.totalMin, tripBarScaleMinutes(trip))],
    axis: tripAxis(trip),
    tripMode: { direct: 'bus', transfer: 'bus', walk: 'walk', none: null }[trip.transit.kind],
  };
}

export function tripCard({ place, trip, method, instant, rankedBy = 'bus', streets = null }) {
  const { bars, axis, tripMode } = tripBars(trip, method);
  const [car] = bars;
  return {
    placeId: place.id,
    name: place.name,
    kind: place.kind,
    storeTypeWords: place.kind === 'other-retailer' && place.storeType ? storeTypeWords(place.storeType) : null,
    benefitsAcceptedWords: place.kind === 'pantry' ? null : benefitsAcceptedWords(place),
    address: place.address ?? null,
    phone: phoneLink(place.phone),
    openStatus: openStatusModel(place, instant),
    bars,
    axis,
    breakdowns: modeBreakdowns(trip, bars, { streets, method, placeName: place.name }),
    tripMode,
    quickParts: quickParts(trip, car, rankedBy),
    quickText: quickParts(trip, car, rankedBy).map((part) => part.spokenText).join(' · '),
    gapText: gapWords(trip.disparity),
    disparity: {
      band: trip.disparity.band,
      words: disparityBandWords(trip.disparity.band, method),
      reason: hasTransitTrip(trip) ? disparityExplanationWords(trip.disparity) : walkOnlyReason(trip.transit),
      severity: SEVERITY_BY_BAND[trip.disparity.band],
    },
    trace: {
      stamp: { methodVersion: trip.methodVersion, snapshotId: trip.snapshotId, streetsSnapshotId: trip.streetsSnapshotId, timetableSnapshotId: trip.timetableSnapshotId, period: trip.inputs.period },
    },
  };
}

function isClosedNow(place, instant) {
  return place.kind === 'pantry' && openStatus(place.hoursText, instant).state === 'closed';
}

export const PLACES_LISTED = 8;

const RANKING_BY_MAP_MODE = Object.freeze({ bus: 'bus', walk: 'walk', car: 'car' });

export function nearestPlaceCards({ state, providers, network, method, instant, count = PLACES_LISTED }) {
  const places = providers.filter((provider) => state.kinds.includes(provider.kind));
  const notClosedPlaces = places.filter((place) => !isClosedNow(place, instant));
  const closedPlaces = places.filter((place) => isClosedNow(place, instant));
  const options = { period: state.period, count, rankedBy: RANKING_BY_MAP_MODE[state.mapMode] ?? 'bus' };
  const notClosedTrips = fastestTrips(state.origin.point, notClosedPlaces, network, method, options);
  const closedTrips = notClosedTrips.length < count ? fastestTrips(state.origin.point, closedPlaces, network, method, options) : [];
  return [...notClosedTrips, ...closedTrips]
    .slice(0, count)
    .map((trip) => tripCard({ place: trip.inputs.destination, trip, method, instant, rankedBy: options.rankedBy, streets: network.streets ?? null }));
}
