import { param } from '../../method.js';
import { countyFindingWords, focusBackWords, typicalTripWords, modeHeadingWords, noBusTripShortWords } from '../../language.js';
import { highNeedCells, highNeedSummary } from '../map/high_need.js';
import { FINDINGS_PERIOD, lensValueForCell } from '../shared/lens.js';
import { element } from '../shared/dom.js';
import { iconElement } from '../shared/icons.js';
import { comparisonBar, comparisonAxis, barScaleMinutes } from './cards.js';
import { comparisonBarsView } from './place_card_view.js';

const TYPICAL_MODES = Object.freeze(['car', 'bus', 'walk']);
const BLOCK_ORDER = Object.freeze(['bus', 'car', 'walk']);

const summariesByCells = new WeakMap();

function summaryAt(cells, { carlessPctOf, method, lineMin, period }) {
  if (!summariesByCells.has(cells)) summariesByCells.set(cells, new Map());
  const byLine = summariesByCells.get(cells);
  const key = `${lineMin}|${period}`;
  if (!byLine.has(key)) byLine.set(key, highNeedSummary(highNeedCells(cells, { carlessPctOf, method, lineMin, period })));
  return byLine.get(key);
}

export function lowerMedian(values) {
  const sorted = values.map((value) => (Number.isFinite(value) ? value : Infinity)).sort((first, second) => first - second);
  const middle = sorted[(sorted.length - 1) >> 1];
  return Number.isFinite(middle) ? middle : null;
}

export function typicalTrips(cells, period) {
  const minutesFor = (lens) => cells.map((cell) => lensValueForCell(cell, { kinds: ['supermarket'], lens, period }));
  const busMinutes = minutesFor('bus');
  return {
    hexagons: cells.length,
    noBusHexagons: busMinutes.filter((minutes) => !Number.isFinite(minutes)).length,
    minutes: { car: lowerMedian(minutesFor('car')), bus: lowerMedian(busMinutes), walk: lowerMedian(minutesFor('walk')) },
  };
}

const typicalByCells = new WeakMap();

function typicalAt(cells, { carlessPctOf, method, lineMin, period, highNeedOnly }) {
  if (!typicalByCells.has(cells)) typicalByCells.set(cells, new Map());
  const byKey = typicalByCells.get(cells);
  const key = `${lineMin}|${period}|${highNeedOnly}`;
  if (!byKey.has(key)) {
    const shown = highNeedOnly ? highNeedCells(cells, { carlessPctOf, method, lineMin, period }).map((row) => row.cell) : cells.filter((cell) => cell.populated);
    byKey.set(key, typicalTrips(shown, period));
  }
  return byKey.get(key);
}

function typicalBars(minutes) {
  const axis = comparisonAxis(barScaleMinutes(Object.values(minutes).filter((value) => value !== null)));
  const bars = TYPICAL_MODES.map((mode) => (minutes[mode] === null
    ? { mode, minutes: null, widthPercent: 0, minutesText: noBusTripShortWords(), missing: true }
    : comparisonBar(mode, minutes[mode], axis.scaleMinutes)));
  return { bars, axis, tripMode: 'bus' };
}

export function countyFindingModel({ cells, carlessPctOf, method, busLineMin, period = FINDINGS_PERIOD, highNeedOnly = false }) {
  const lineMin = busLineMin ?? param(method, 'desertTransitMin');
  const summary = summaryAt(cells, { carlessPctOf, method, lineMin, period });
  const typical = typicalAt(cells, { carlessPctOf, method, lineMin, period, highNeedOnly });
  return {
    typical,
    bars: typicalBars(typical.minutes),
    card: typicalTripWords({ highNeedOnly, noBusHexagons: typical.noBusHexagons, period, parkingMin: param(method, 'parkingMin'), walkMph: param(method, 'walkMph') }),
    lineMin,
    period,
    summary,
    words: countyFindingWords(summary, { lineMin }),
  };
}

function button(className, text, onPress, attributes = {}) {
  const created = element('button', { className, text, attributes: { type: 'button', ...attributes } });
  created.addEventListener('click', onPress);
  return created;
}

export function focusBackButton(behind, onBack) {
  return button('link-button focus-back', focusBackWords(behind), onBack, { id: 'focus-back' });
}

export function focusBackSpace() {
  return element('div', { className: 'focus-back focus-back-space', attributes: { 'aria-hidden': 'true' } });
}

function modeSummary(model, mode) {
  const bar = model.bars.bars.find((each) => each.mode === mode);
  return element('section', { className: `mode-block mode-block-${mode}` }, [
    element('div', { className: 'mode-heading' }, [
      element('h3', { className: 'mode-name' }, [iconElement(mode), document.createTextNode(modeHeadingWords(mode))]),
      element('span', { className: `mode-total mode-text-${mode}`, text: bar.minutesText }),
    ]),
    element('p', { className: 'mode-note', text: model.card.notes[mode] }),
  ]);
}

export function countyFinding(model) {
  return element('article', { className: 'place-card county-finding', attributes: { id: 'county-finding', tabindex: '-1', 'aria-labelledby': 'county-finding-heading' } }, [
    element('div', { className: 'place-identity' }, [
      element('div', { className: 'place-summary-head' }, [element('h2', { className: 'place-name', text: model.card.title, attributes: { id: 'county-finding-heading' } })]),
      element('p', { className: 'place-meta', text: model.card.meta }),
    ]),
    element('div', { className: 'comparison' }, [
      element('p', { className: 'disparity disparity-alert' }, [element('span', { className: 'disparity-dot', attributes: { 'aria-hidden': 'true' } }), document.createTextNode(model.words.headline)]),
      comparisonBarsView(model.bars, { explainsRange: false }),
    ]),
    ...BLOCK_ORDER.map((mode) => modeSummary(model, mode)),
  ]);
}

export function countyFindingSummary(model, onExpand) {
  const parts = BLOCK_ORDER.map((mode) => model.bars.bars.find((bar) => bar.mode === mode));
  const summary = element('button', { className: 'place-summary finding-summary', attributes: { type: 'button' } }, [
    element('span', { className: 'place-summary-head' }, [element('span', { className: 'place-name', text: model.card.title })]),
    element('span', { className: 'place-quick', attributes: { 'aria-label': parts.map((bar) => `${modeHeadingWords(bar.mode)} ${bar.minutesText}`).join(' · ') } }, parts.flatMap((bar, index) => [
      index > 0 ? document.createTextNode(' · ') : null,
      element('span', { className: `mode-text-${bar.mode}` }, [iconElement(bar.mode), document.createTextNode(bar.minutesText)]),
    ])),
  ]);
  summary.addEventListener('click', onExpand);
  return summary;
}
