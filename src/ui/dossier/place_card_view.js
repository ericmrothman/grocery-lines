import { routeNumberWords, stepsToggleWords, modeHeadingWords } from '../../language.js';
import { element } from '../shared/dom.js';
import { iconElement, kindMarkElement } from '../shared/icons.js';

function positionedSpan(className, fromPercent, toPercent) {
  const span = element('span', { className });
  span.style.left = `${fromPercent}%`;
  span.style.width = `${toPercent - fromPercent}%`;
  return span;
}

function barTrack(bar) {
  if (bar.missing) return element('span', { className: 'bar-missing' });
  return element('span', { className: 'bar-track' }, [
    positionedSpan(`bar-segment bar-${bar.mode}`, 0, bar.widthPercent),
    bar.range ? positionedSpan('bar-range-line', bar.range.fromPercent, bar.range.toPercent) : null,
  ]);
}

function barValue(bar, explainsRange) {
  if (!bar.hasRange) return element('span', { className: `bar-value mode-text-${bar.mode}`, text: bar.minutesText });
  if (!explainsRange) {
    return element('span', { className: `bar-value bar-value-noted mode-text-${bar.mode}`, attributes: { title: bar.rangeExplanation } }, [
      element('span', { className: 'bar-digits', text: bar.minutesText }),
      element('span', { className: 'bar-asterisk', text: '*', attributes: { 'aria-hidden': 'true' } }),
    ]);
  }
  return element('button', {
    className: `bar-value bar-value-trigger mode-text-${bar.mode}`,
    attributes: { type: 'button', 'aria-label': `${bar.spokenMinutesText}. ${bar.rangeExplanation}`, title: bar.rangeExplanation, 'data-show-mode-block': bar.mode },
  }, [
    element('span', { className: 'bar-digits', text: bar.minutesText }),
    element('span', { className: 'bar-asterisk', text: '*', attributes: { 'aria-hidden': 'true' } }),
  ]);
}

function barRow(bar, isOtherWay, rowNumber, explainsRange) {
  const cells = [
    element('span', { className: 'bar-label' }, [iconElement(bar.mode), element('span', { className: 'visually-hidden', text: modeHeadingWords(bar.mode) })]),
    barTrack(bar),
    barValue(bar, explainsRange),
  ];
  for (const cell of cells) cell.style.gridRow = String(rowNumber);
  return element('div', { className: `bar-row${isOtherWay ? ' is-other-way' : ''}` }, cells);
}

function axisGridlines(axis, firstRow, rowCount) {
  const gridlines = element('div', { className: 'bar-gridlines', attributes: { 'aria-hidden': 'true' } }, axis.ticks.map((tick) => {
    const line = element('span', { className: 'bar-gridline' });
    line.style.left = `${tick.percent}%`;
    return line;
  }));
  gridlines.style.gridRow = `${firstRow} / span ${rowCount}`;
  return gridlines;
}

function axisLabels(axis, rowNumber) {
  const labels = element('div', { className: 'bar-axis', attributes: { 'aria-hidden': 'true' } }, axis.ticks.map((tick) => {
    const label = element('span', { className: 'bar-axis-label', text: tick.words });
    label.style.left = `${tick.percent}%`;
    return label;
  }));
  labels.style.gridRow = String(rowNumber);
  return labels;
}

function annotationRow(track, rowNumber) {
  const cells = [element('span', { className: 'bar-label' }), track];
  for (const cell of cells) cell.style.gridRow = String(rowNumber);
  return element('div', { className: 'bar-row bar-row-annotation' }, cells);
}

function spokenBars(bars) {
  const words = { car: (bar) => `Car ${bar.minutesText}`, bus: (bar) => `bus and walking ${bar.spokenMinutesText ?? bar.minutesText}`, walk: (bar) => `walking the whole way ${bar.minutesText}` };
  return `${bars.map((bar) => words[bar.mode](bar)).join(', ')}.`;
}

export function comparisonBarsView({ bars, axis, tripMode }, { explainsRange = true, leadRows = [], shownModes = null } = {}) {
  const shown = shownModes ? bars.filter((bar) => shownModes.includes(bar.mode)) : bars;
  const firstBarRow = leadRows.length + 1;
  return element('div', { className: 'bars', attributes: { 'aria-label': spokenBars(shown) } }, [
    ...leadRows.map((row, index) => annotationRow(row, index + 1)),
    ...shown.map((bar, index) => barRow(bar, bar.mode !== 'car' && bar.mode !== tripMode, firstBarRow + index, explainsRange)),
    axisGridlines(axis, firstBarRow, shown.length),
    axisLabels(axis, firstBarRow + shown.length),
  ]);
}

function statusBadge(card) {
  if (!card.openStatus?.words) return null;
  return element('span', { className: `status status-${card.openStatus.state}`, text: card.openStatus.words });
}

function disparityLine(card) {
  return element('p', { className: `disparity disparity-${card.disparity.severity}` }, [
    element('span', { className: 'disparity-dot', attributes: { 'aria-hidden': 'true' } }),
    element('strong', { className: 'disparity-band', text: card.disparity.words }),
    card.disparity.reason ? document.createTextNode(`: ${card.disparity.reason}`) : null,
  ]);
}

function phoneAnchor(card) {
  if (!card.phone) return null;
  return element('a', { className: 'phone-link', attributes: { href: card.phone.href } }, [iconElement('phone'), document.createTextNode(card.phone.label)]);
}

function quickTextParts(card) {
  return card.quickParts.flatMap((part, index) => [
    index > 0 ? document.createTextNode(' · ') : null,
    element('span', { className: `mode-text-${part.mode}` }, [part.mode === 'gap' ? null : iconElement(part.mode), document.createTextNode(part.text)]),
  ]);
}

export function placeSummary(card, index, onChoose) {
  const button = element('button', { className: 'place-summary', attributes: { type: 'button', 'data-place-id': card.placeId } }, [
    element('span', { className: 'place-summary-head' }, [
      element('span', { className: 'place-name' }, [kindMarkElement(card.kind), document.createTextNode(card.name)]),
      statusBadge(card),
    ]),
    element('span', { className: 'place-quick', attributes: { 'aria-label': card.quickText } }, quickTextParts(card)),
  ]);
  button.addEventListener('click', () => onChoose(card.placeId));
  return button;
}

function maneuverRow(step) {
  return element('li', { className: 'maneuver' }, [
    element('span', { className: 'maneuver-glyph', text: step.glyph, attributes: { 'aria-hidden': 'true' } }),
    element('span', { className: 'maneuver-instruction', text: step.instruction }),
    element('span', { className: 'maneuver-minutes', text: step.shownText ?? '' }),
    step.basis ? element('span', { className: 'maneuver-basis', text: step.basis }) : null,
  ]);
}

function stepRow(piece) {
  const words = piece.words;
  const maneuvers = piece.maneuvers?.length > 0
    ? element('ol', { className: 'maneuvers', attributes: { 'aria-label': `${words}, turn by turn` } }, piece.maneuvers.map(maneuverRow))
    : null;
  return element('li', { className: 'step' }, [
    element('span', { className: 'step-icon' }, [iconElement(piece.icon)]),
    element('span', { className: 'step-label', text: words }),
    element('span', { className: 'step-minutes', text: piece.shownText }),
    element('span', { className: 'step-basis', text: piece.basis }),
    maneuvers,
  ]);
}

function stepList(breakdown) {
  return element('ol', { className: 'steps' }, [
    ...breakdown.pieces.map(stepRow),
    element('li', { className: 'step step-total' }, [
      element('span', { className: 'step-icon' }),
      element('span', { className: 'step-label', text: 'Total' }),
      element('span', { className: 'step-minutes', text: breakdown.stepsTotalText }),
    ]),
  ]);
}

function tripPiece(piece) {
  const span = element('span', { className: `trip-piece trip-piece-${piece.part}` });
  span.style.flexGrow = String(piece.minutes);
  if (piece.part === 'ride' && piece.route) span.append(element('span', { className: 'trip-piece-route', text: routeNumberWords(piece.route) }));
  return span;
}

function tripOrderKey(key) {
  return element('ul', { className: 'trip-order-key' }, key.map((keyPart) => element('li', {}, [
    element('span', { className: `trip-key-swatch trip-piece-${keyPart.part}`, attributes: { 'aria-hidden': 'true' } }),
    document.createTextNode(keyPart.text),
  ])));
}

function stepsToggle(mode, open, onToggle) {
  const toggle = element('button', {
    className: 'steps-toggle',
    text: stepsToggleWords(open),
    attributes: { type: 'button', 'aria-expanded': String(open), 'aria-controls': `steps-${mode}`, 'data-steps-mode': mode },
  });
  toggle.addEventListener('click', () => onToggle(mode));
  return toggle;
}

function modeBlock(breakdown, { open, onToggle }) {
  const heading = element('div', { className: 'mode-heading' }, [
    element('h3', { className: 'mode-name' }, [
      iconElement(breakdown.mode),
      document.createTextNode(breakdown.heading),
      breakdown.headingDetail ? element('span', { className: 'mode-name-detail', text: ` · ${breakdown.headingDetail}` }) : null,
    ]),
    element('span', { className: `mode-total mode-text-${breakdown.mode}`, text: breakdown.totalText }),
  ]);
  const notes = [breakdown.headingNote, breakdown.noTripText, breakdown.walkWinsNote]
    .filter(Boolean)
    .map((note) => element('p', { className: 'mode-note', text: note }));
  const bar = breakdown.pieces.length > 1
    ? [element('div', { className: 'trip-order-bar', attributes: { 'aria-hidden': 'true' } }, breakdown.pieces.map(tripPiece)), tripOrderKey(breakdown.key)]
    : [];
  const steps = breakdown.hasSteps ? [stepsToggle(breakdown.mode, open, onToggle)] : [];
  if (breakdown.hasSteps) {
    const stepsBody = element('div', { className: 'mode-steps', attributes: { id: `steps-${breakdown.mode}` } }, open ? [stepList(breakdown)] : []);
    stepsBody.hidden = !open;
    steps.push(stepsBody);
  }
  return element('section', { className: `mode-block mode-block-${breakdown.mode}${open ? ' is-open' : ''}`, attributes: { id: `mode-block-${breakdown.mode}`, tabindex: '-1' } }, [heading, ...notes, ...bar, ...steps]);
}

export function placeCard(card, { openSteps, onStepsToggled }) {
  const unclearHours = card.openStatus?.state === 'unknown' && card.openStatus.rawHours
    ? element('p', { className: 'place-meta', text: `Listed hours: ${card.openStatus.rawHours}` })
    : null;
  const details = [card.storeTypeWords, card.benefitsAcceptedWords, card.address].filter(Boolean).join(' · ');
  const identity = element('div', { className: 'place-identity' }, [
    element('div', { className: 'place-summary-head' }, [element('h2', { className: 'place-name' }, [kindMarkElement(card.kind), document.createTextNode(card.name)]), statusBadge(card)]),
    element('p', { className: 'place-meta' }, [document.createTextNode(details), card.phone ? document.createTextNode(details ? ' · ' : '') : null, phoneAnchor(card)]),
    unclearHours,
  ]);
  const comparison = element('div', { className: 'comparison' }, [disparityLine(card), comparisonBarsView(card)]);
  const blocks = card.breakdowns.map((breakdown) => modeBlock(breakdown, { open: openSteps === breakdown.mode, onToggle: onStepsToggled }));
  return element('article', { className: 'place-card', attributes: { tabindex: '-1', id: 'place-card' } }, [identity, comparison, ...blocks]);
}
