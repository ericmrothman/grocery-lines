import { timePieces, busLegLeavingAt, estimateDrive, estimateWalk } from '../../mobility.js';
import { clockWords, routeNumberWords, minutesWords, groceryExtraWords, groceryShoppingWords, groceryCompareWords, groceryDeparturesWords, groceryDepartureWords, groceryDoorToDoorWords, groceryLeaveHomeWords, groceryArrivalWords, groceryDepartureHeadingWords, groceryBusLeavesWords, groceryPhaseWords } from '../../language.js';

const STAGE_RULES = Object.freeze({
  oneRun: { focus: 'quickest', shops: 'shorter', subheading: 'leaveHome', lineLabel: 'none', namesPhases: true },
  everyDeparture: { shops: 'shorter', subheading: 'departures' },
  quickestSlowest: { shops: 'shorter', subheading: 'departures', highlight: ['quickest', 'slowest'] },
  atTheStore: { focus: 'quickest', shops: 'shorter', subheading: 'leaveHome', lineLabel: 'none', labelledParts: ['shop'], buses: ['caught'], marksArrival: true },
  missedBus: { focus: 'quickest', shops: 'both', subheading: 'leaveHome', lineLabel: 'shopTime', labelledParts: ['shop'], buses: ['caught', 'next'], marksArrival: true },
  wholeTrip: { focus: 'quickest', shops: 'both', subheading: 'leaveHome', lineLabel: 'shopTime', labelledParts: ['shop'], buses: ['caught', 'next'], extras: true, marksArrival: true },
  allDay: { shops: 'both', subheading: 'departures', extras: true },
  withCarAndFoot: { shops: 'both', subheading: 'departures', extras: true, compare: true },
});
export const GROCERY_CHART_STAGES = Object.freeze(Object.keys(STAGE_RULES));
const KEY_ORDER = Object.freeze(['walk', 'wait', 'ride', 'shop', 'drive', 'park']);
const TICK_STEPS_MIN = Object.freeze([5, 10, 15, 30]);
const MOST_TICKS = 6;

function timedBlocks(leg, startsAt, direction) {
  let clock = startsAt;
  return timePieces(leg).map((piece) => {
    const block = { part: piece.part, direction, startsAt: clock, endsAt: clock + piece.minutes, minutes: piece.minutes, route: piece.route, busLeavesAt: piece.component.busLeavesAt ?? piece.component.departsAt ?? null };
    clock += piece.minutes;
    return block;
  });
}

export function groceryRun({ leaveAt, shopMin, tripAt }) {
  const there = tripAt('there', leaveAt);
  if (!there) return null;
  const atStore = leaveAt + there.totalMin;
  const shopEnds = atStore + shopMin;
  const back = tripAt('back', shopEnds);
  if (!back) return null;
  const shopping = { part: 'shop', direction: 'store', startsAt: atStore, endsAt: shopEnds, minutes: shopMin, route: null, busLeavesAt: null };
  const homeAt = shopEnds + back.totalMin;
  return { leaveAt, shopMin, atStore, homeAt, totalMin: homeAt - leaveAt, blocks: [...timedBlocks(there, leaveAt, 'there'), shopping, ...timedBlocks(back, shopEnds, 'back')] };
}

function departureMinutes({ firstMin, lastMin, everyMin }) {
  const minutes = [];
  for (let leaveAt = firstMin; leaveAt <= lastMin; leaveAt += everyMin) minutes.push(leaveAt);
  return minutes;
}

export function groceryRunSeries({ departures, shopMins, tripAt }) {
  return departureMinutes(departures)
    .map((leaveAt) => ({ leaveAt, runs: Object.fromEntries(shopMins.map((shopMin) => [shopMin, groceryRun({ leaveAt, shopMin, tripAt })])) }))
    .filter((row) => shopMins.every((shopMin) => row.runs[shopMin]));
}

export function steadyRun({ part, oneWayMin, shopMin }) {
  return {
    leaveAt: 0,
    shopMin,
    totalMin: oneWayMin * 2 + shopMin,
    blocks: [
      { part, direction: 'there', startsAt: 0, endsAt: oneWayMin, minutes: oneWayMin, route: null, busLeavesAt: null },
      { part: 'shop', direction: 'store', startsAt: oneWayMin, endsAt: oneWayMin + shopMin, minutes: shopMin, route: null, busLeavesAt: null },
      { part, direction: 'back', startsAt: oneWayMin + shopMin, endsAt: oneWayMin * 2 + shopMin, minutes: oneWayMin, route: null, busLeavesAt: null },
    ],
  };
}

export function extraShoppingCost(row, shorterMin, longerMin) {
  return row.runs[longerMin].totalMin - row.runs[shorterMin].totalMin;
}

function routesRidden(run) {
  return run.blocks.filter((block) => block.part === 'ride').map((block) => block.route);
}

function ridesOneRoute(row, shopMins) {
  return new Set(shopMins.flatMap((shopMin) => routesRidden(row.runs[shopMin]))).size === 1;
}

export function featuredRows(series, [shorterMin, longerMin]) {
  const oneRoute = series.filter((row) => ridesOneRoute(row, [shorterMin, longerMin]));
  if (oneRoute.length === 0) return null;
  const byTotal = [...oneRoute].sort((first, second) => first.runs[shorterMin].totalMin - second.runs[shorterMin].totalMin || first.leaveAt - second.leaveAt);
  return { quickest: byTotal[0], slowest: byTotal.at(-1) };
}

export function reachesStopHomeAt(run) {
  const firstBlockAtTheStop = run.blocks.find((block) => block.direction === 'back' && block.part !== 'walk');
  return firstBlockAtTheStop ? firstBlockAtTheStop.startsAt : null;
}

function arrivalMark(rule, size, run, caughtBus) {
  const reachesStop = reachesStopHomeAt(run);
  if (!rule.marksArrival || size !== 'feature' || reachesStop === null) return null;
  return { atMin: reachesStop - run.leaveAt, side: reachesStop <= caughtBus.busLeavesAt ? 'beforeTheBus' : 'afterTheBus', words: groceryArrivalWords() };
}

export function runPhases(run) {
  const shopStartsMin = run.atStore - run.leaveAt;
  const shopEndsMin = shopStartsMin + run.shopMin;
  return [
    { phase: 'there', fromMin: 0, minutes: shopStartsMin },
    { phase: 'store', fromMin: shopStartsMin, minutes: run.shopMin },
    { phase: 'back', fromMin: shopEndsMin, minutes: run.totalMin - shopEndsMin },
  ].map((part) => ({ ...part, words: groceryPhaseWords(part.phase), minutesText: minutesWords(part.minutes) }));
}

function busHome(run) {
  return run.blocks.find((block) => block.direction === 'back' && block.part === 'wait' && block.busLeavesAt !== null) ?? null;
}

export function groceryChartModel({ series, shopMins, departures, compare }) {
  const [shorterMin, longerMin] = shopMins;
  const featured = featuredRows(series, shopMins);
  if (!featured) return { problems: ['No grocery run rides a single bus route there and back, so the chart has no quickest or slowest run to show'] };
  const caught = busHome(featured.quickest.runs[shorterMin]);
  const next = busHome(featured.quickest.runs[longerMin]);
  if (!caught || !next) return { problems: ['The quickest grocery run has no bus home to wait for, so the zoomed views have no departure to show'] };
  return { found: { series, shopMins, departures, compare, featured, busesHome: { caught, next } } };
}

export function groceryRunsFor(run, { network, method, placesById }) {
  const store = placesById.get(run.placeId);
  if (!store) return { problems: [`The grocery run's store ${run.placeId} is not in the data`] };
  const home = { ...run.from, source: 'map-point' };
  const storeDoor = { ...store, source: 'map-point' };
  const tripAt = (direction, leaveAt) => (direction === 'there'
    ? busLegLeavingAt(home, store, network, method, { leaveAt, period: run.period })
    : busLegLeavingAt(storeDoor, home, network, method, { leaveAt, period: run.period }));
  const [shorterMin] = run.shopMins;
  const compare = [
    steadyRun({ part: 'drive', oneWayMin: estimateDrive(home, store, network, method).totalMin, shopMin: shorterMin }),
    steadyRun({ part: 'walk', oneWayMin: estimateWalk(home, store, network, method).totalMin, shopMin: shorterMin }),
  ];
  return groceryChartModel({ series: groceryRunSeries({ departures: run.departures, shopMins: run.shopMins, tripAt }), shopMins: run.shopMins, departures: run.departures, compare });

}

function tickStep(spanMin) {
  return TICK_STEPS_MIN.find((step) => spanMin / step <= MOST_TICKS) ?? TICK_STEPS_MIN.at(-1);
}

function ticksAcross(domain) {
  const step = tickStep(domain.toMin - domain.fromMin);
  const ticks = [];
  for (let minutes = 0; minutes <= domain.toMin; minutes += step) {
    if (minutes >= domain.fromMin) ticks.push({ key: String(minutes), atMin: minutes, words: minutes === 0 ? '0' : minutesWords(minutes), isMinor: (minutes / step) % 2 === 1 });
  }
  return ticks;
}

function partsIn(runs) {
  const parts = new Set(runs.flatMap((run) => run.blocks.map((block) => block.part)));
  return KEY_ORDER.filter((part) => parts.has(part));
}

function lineLabel(rule, size, leaveAt, shopMin, isShorter) {
  if (size === 'feature' && rule.lineLabel === 'none') return '';
  if (size === 'feature') return rule.lineLabel === 'leaveHome' ? groceryLeaveHomeWords(leaveAt) : groceryShoppingWords(shopMin);
  return isShorter ? clockWords(leaveAt) : '';
}

function subheading(rule, focus, departures, shownShops) {
  if (rule.subheading === 'leaveHome') return groceryDepartureHeadingWords(focus.leaveAt);
  if (rule.subheading === 'departures') return groceryDeparturesWords(departures, shownShops.length === 1 ? shownShops[0] : null);
  return '';
}

export function groceryChartFrame(stage, model) {
  const rule = STAGE_RULES[stage];
  if (!rule) throw new Error(`Unknown grocery chart stage: ${stage}`);
  const { series, shopMins: [shorterMin, longerMin], featured, busesHome, compare } = model;
  const focus = rule.focus ? featured[rule.focus] : null;
  const highlighted = new Set((rule.highlight ?? []).map((name) => featured[name].leaveAt));
  const shownShops = rule.shops === 'both' ? [shorterMin, longerMin] : [shorterMin];
  const isShown = (row, shopMin) => shownShops.includes(shopMin) && (focus === null || row.leaveAt === focus.leaveAt);
  const shownRuns = series.flatMap((row) => shownShops.filter((shopMin) => isShown(row, shopMin)).map((shopMin) => row.runs[shopMin]));
  const buses = (rule.buses ?? []).map((name) => ({ name, wait: busesHome[name] }));
  const everyRun = [...series.flatMap((row) => [shorterMin, longerMin].map((shopMin) => row.runs[shopMin])), ...compare];
  const domain = { fromMin: 0, toMin: Math.max(...(focus ? shownRuns : everyRun).map((run) => run.totalMin)) };
  const lines = series.flatMap((row) => [shorterMin, longerMin].map((shopMin) => {
    const shown = isShown(row, shopMin);
    const isShorter = shopMin === shorterMin;
    const size = !shown ? 'hidden' : focus ? 'feature' : 'row';
    return {
      key: `${row.leaveAt}:${shopMin}`,
      leaveAt: row.leaveAt,
      shopMin,
      size,
      isDim: highlighted.size > 0 && !highlighted.has(row.leaveAt),
      label: lineLabel(rule, size, row.leaveAt, shopMin, isShorter),
      total: minutesWords(row.runs[shopMin].totalMin),
      showsTotal: shown && (size === 'feature' || rule.shops === 'shorter'),
      extra: shown && !isShorter && rule.extras ? groceryExtraWords(extraShoppingCost(row, shorterMin, longerMin)) : null,
      arrival: arrivalMark(rule, size, row.runs[shopMin], busesHome.caught),
      phases: rule.namesPhases && size === 'feature' ? runPhases(row.runs[shopMin]) : null,
    };
  }));
  return {
    stage,
    heading: groceryDoorToDoorWords(),
    subheading: subheading(rule, focus, model.departures, shownShops),
    labelledParts: rule.labelledParts ?? [],
    domain,
    ticks: ticksAcross(domain),
    lines,
    compare: compare.map((run) => ({ label: groceryCompareWords(run.blocks[0].part), total: minutesWords(run.totalMin), isShown: Boolean(rule.compare) })),
    busesHome: buses.map(({ name, wait }) => {
      const atMin = wait.busLeavesAt - focus.leaveAt;
      const isAhead = atMin > domain.toMin;
      return { key: `${wait.route}@${wait.busLeavesAt}`, atMin: Math.min(atMin, domain.toMin), atPercent: ((Math.min(atMin, domain.toMin) - domain.fromMin) / (domain.toMin - domain.fromMin)) * 100, isNext: name === 'next', isAhead, routeNumber: routeNumberWords(wait.route), leaves: groceryBusLeavesWords(wait.busLeavesAt, isAhead), words: groceryDepartureWords({ route: wait.route, clockMin: wait.busLeavesAt }, { isNext: name === 'next', isAhead }) };
    }),
    keyParts: partsIn([...shownRuns, ...(rule.compare ? compare : [])]),
  };
}
