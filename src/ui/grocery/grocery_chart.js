import { groceryBlockWords, groceryPieceWords, groceryWaitingWords, groceryMissingWords } from '../../language.js';
import { groceryChartFrame, GROCERY_CHART_STAGES } from './grocery_runs.js';
import { partsKey } from '../story/mode_bars.js';
import { crossFade } from '../shared/fades.js';
import { ICON_GRID_UNITS, ROUTE_ICON_PATHS, routeChipVariables } from '../map/route_icons.js';
import { element } from '../shared/dom.js';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const CHART_ROUTE_CHIP_SCALE = 0.75;
const BUS_LABEL_GAP_PX = 4;

function placeAt(domain) {
  const spanMin = domain.toMin - domain.fromMin;
  return {
    isClipped: (fromMin, toMin) => fromMin < domain.fromMin || toMin > domain.toMin,
    start: (minutes) => `${((minutes - domain.fromMin) / spanMin) * 100}%`,
    length: (minutes) => `${(minutes / spanMin) * 100}%`,
  };
}

function settle(mark) {
  Promise.all(mark.getAnimations().map((animation) => animation.finished))
    .then(() => { if (mark.hasAttribute('data-leaving')) mark.remove(); })
    .catch(() => {});
}

function showMarks(container, items, at, make, update = () => {}) {
  const existing = new Map([...container.children].map((mark) => [mark.dataset.key, mark]));
  for (const item of items) {
    let mark = existing.get(item.key);
    if (!mark) {
      mark = make(item);
      mark.dataset.key = item.key;
      mark.dataset.atMin = String(item.atMin);
      mark.style.left = at.start(item.atMin);
      mark.setAttribute('data-entering', '');
      container.append(mark);
      mark.getBoundingClientRect();
      mark.removeAttribute('data-entering');
    }
    mark.removeAttribute('data-leaving');
    mark.dataset.atMin = String(item.atMin);
    mark.style.left = at.start(item.atMin);
    update(mark, item);
    existing.delete(item.key);
  }
  for (const mark of existing.values()) {
    mark.setAttribute('data-leaving', '');
    mark.style.left = at.start(Number(mark.dataset.atMin));
    settle(mark);
  }
}

function lineElement(run) {
  const line = element('li', { className: 'grocery-line' });
  const label = element('span', { className: 'grocery-label' });
  const title = element('span', { className: 'grocery-line-title' });
  const track = element('div', { className: 'grocery-track' });
  const bars = element('div', { className: 'grocery-bars' });
  const pieces = run.blocks.map((block) => {
    const piece = element('span', { className: `grocery-piece trip-piece-${block.part}` });
    piece.title = groceryBlockWords(block);
    piece.append(element('span', { className: 'grocery-piece-words', text: groceryPieceWords(block) }));
    return { piece, block };
  });
  bars.append(...pieces.map(({ piece }) => piece));
  const total = element('span', { className: 'grocery-total' });
  const extra = element('span', { className: 'grocery-extra' });
  const extraUnder = element('span', { className: 'grocery-extra grocery-extra-under' });
  const arrivalLane = element('div', { className: 'grocery-arrival-lane' });
  const arrival = element('span', { className: 'grocery-arrival' });
  const phases = ['there', 'store', 'back'].map((phase) => element('span', { className: `grocery-phase grocery-phase-${phase}` }, [
    element('span', { className: 'grocery-phase-name' }),
    element('span', { className: 'grocery-phase-minutes' }),
  ]));
  arrivalLane.append(arrival, ...phases);
  track.append(bars, total);
  line.append(title, label, track, extra, extraUnder, arrivalLane);
  return { line, label, title, pieces, total, extra, extraUnder, arrival, phases, run };
}

function showWords(target, words) {
  if (words) target.textContent = words;
  target.toggleAttribute('data-shown', Boolean(words));
}

function fadeToWords(target, words) {
  crossFade(target, words, () => { target.textContent = words; });
}

function showLine(drawn, shown, at, labelledParts) {
  drawn.line.dataset.size = shown.size;
  drawn.line.toggleAttribute('data-dim', shown.isDim);
  showWords(drawn.title, shown.size === 'feature' ? shown.label : '');
  drawn.line.toggleAttribute('data-titled', shown.size === 'feature' && Boolean(shown.label));
  showWords(drawn.label, shown.size === 'feature' ? '' : shown.label);
  drawn.total.textContent = shown.total;
  drawn.total.toggleAttribute('data-shown', shown.showsTotal);
  showWords(drawn.extra, shown.size === 'feature' ? null : shown.extra);
  showWords(drawn.extraUnder, shown.size === 'feature' ? shown.extra : null);
  for (const { piece, block } of drawn.pieces) {
    const fromMin = block.startsAt - drawn.run.leaveAt;
    piece.style.left = at.start(fromMin);
    piece.style.width = at.length(block.minutes);
    piece.toggleAttribute('data-clipped', at.isClipped(fromMin, fromMin + block.minutes));
    piece.toggleAttribute('data-unlabelled', !labelledParts.includes(block.part));
  }
  drawn.total.style.left = at.start(drawn.run.totalMin);
  drawn.line.toggleAttribute('data-marks-arrival', Boolean(shown.arrival));
  drawn.line.toggleAttribute('data-names-phases', Boolean(shown.phases));
  drawn.phases.forEach((mark, index) => showPhase(mark, shown.phases?.[index] ?? null, at));
  showWords(drawn.arrival, shown.arrival?.words);
  if (shown.arrival) {
    drawn.arrival.style.left = at.start(shown.arrival.atMin);
    drawn.arrival.dataset.side = shown.arrival.side;
  }
}

function showPhase(mark, phase, at) {
  mark.toggleAttribute('data-shown', Boolean(phase));
  if (!phase) return;
  mark.style.left = at.start(phase.fromMin);
  mark.style.width = at.length(phase.minutes);
  mark.firstChild.textContent = phase.words;
  mark.lastChild.textContent = phase.minutesText;
}

function busIcon() {
  const icon = document.createElementNS(SVG_NAMESPACE, 'svg');
  icon.setAttribute('class', 'route-chip-icon');
  icon.setAttribute('viewBox', `0 0 ${ICON_GRID_UNITS} ${ICON_GRID_UNITS}`);
  icon.setAttribute('aria-hidden', 'true');
  const shape = document.createElementNS(SVG_NAMESPACE, 'path');
  shape.setAttribute('d', ROUTE_ICON_PATHS.bus);
  icon.append(shape);
  return icon;
}

function busMark() {
  const mark = element('span', { className: 'grocery-bus' });
  const words = element('span', { className: 'grocery-bus-words' });
  const chip = element('span', { className: 'route-chip' });
  chip.append(busIcon(), element('span', { className: 'route-chip-number' }), element('span', { className: 'grocery-bus-leaves' }));
  words.append(chip);
  mark.append(words);
  return mark;
}

function showBus(mark, bus) {
  mark.toggleAttribute('data-ahead', bus.isAhead);
  mark.toggleAttribute('data-next', bus.isNext);
  const words = mark.querySelector('.grocery-bus-words');
  words.setAttribute('aria-label', bus.words);
  words.querySelector('.route-chip-number').textContent = bus.routeNumber;
  words.querySelector('.grocery-bus-leaves').textContent = bus.leaves;
}

function labelSpanPx(bus, widthPx, plotWidthPx) {
  const atPx = (bus.atPercent / 100) * plotWidthPx;
  return bus.isAhead ? [atPx - widthPx, atPx] : [atPx - widthPx / 2, atPx + widthPx / 2];
}

function keepBusLabelsApart(container, buses) {
  const plotWidthPx = container.clientWidth;
  const marksByKey = new Map([...container.children].map((mark) => [mark.dataset.key, mark]));
  let previousRightPx = -Infinity;
  for (const bus of [...buses].sort((first, second) => first.atPercent - second.atPercent)) {
    const mark = marksByKey.get(bus.key);
    if (!mark) continue;
    const [leftPx, rightPx] = labelSpanPx(bus, mark.firstChild.offsetWidth, plotWidthPx);
    const isCrowded = leftPx < previousRightPx + BUS_LABEL_GAP_PX;
    mark.toggleAttribute('data-lower', isCrowded);
    if (!isCrowded) previousRightPx = rightPx;
  }
}

function drawRuns(model) {
  const heading = element('p', { className: 'grocery-heading' });
  const subheading = element('p', { className: 'grocery-subheading' });
  const keySlot = element('div', { className: 'grocery-key' });
  const axis = element('div', { className: 'grocery-axis' });
  axis.setAttribute('aria-hidden', 'true');
  const compare = element('ol', { className: 'grocery-lines grocery-compare' });
  const comparedLines = model.compare.map((run) => lineElement(run));
  compare.append(...comparedLines.map((drawn) => drawn.line));
  const list = element('ol', { className: 'grocery-lines' });
  const lines = new Map();
  for (const row of model.series) {
    for (const shopMin of model.shopMins) {
      const drawn = lineElement(row.runs[shopMin]);
      drawn.line.classList.add(shopMin === model.shopMins[0] ? 'is-shorter' : 'is-longer');
      lines.set(`${row.leaveAt}:${shopMin}`, drawn);
      list.append(drawn.line);
    }
  }
  const buses = element('div', { className: 'grocery-buses' });
  const plot = element('div', { className: 'grocery-plot' });
  plot.append(compare, list, buses);
  return { heading, subheading, keySlot, axis, compare, comparedLines, lines, buses, plot, parts: [heading, subheading, keySlot, axis, plot] };
}

function showFrame(drawn, frame) {
  const at = placeAt(frame.domain);
  fadeToWords(drawn.heading, frame.heading);
  fadeToWords(drawn.subheading, frame.subheading);
  crossFade(drawn.keySlot, JSON.stringify(frame.keyParts), () => drawn.keySlot.replaceChildren(partsKey(frame.keyParts)));
  showMarks(drawn.axis, frame.ticks, at, (tick) => element('span', { className: 'grocery-tick', text: tick.words }), (mark, tick) => mark.toggleAttribute('data-minor', tick.isMinor));
  showMarks(drawn.buses, frame.busesHome, at, busMark, showBus);
  keepBusLabelsApart(drawn.buses, frame.busesHome);
  drawn.plot.toggleAttribute('data-has-buses', frame.busesHome.length > 0);
  for (const shown of frame.lines) showLine(drawn.lines.get(shown.key), shown, at, frame.labelledParts);
  drawn.compare.toggleAttribute('data-shown', frame.compare.some((shown) => shown.isShown));
  frame.compare.forEach((shown, index) => showLine(drawn.comparedLines[index], { size: shown.isShown ? 'row' : 'hidden', isDim: false, label: shown.label, total: shown.total, showsTotal: true, extra: null, arrival: null }, at, frame.labelledParts));
}

export function createGroceryChart(container) {
  const figure = element('figure', { className: 'grocery-chart' });
  for (const [name, value] of Object.entries(routeChipVariables(CHART_ROUTE_CHIP_SCALE))) figure.style.setProperty(name, value);
  let state = { phase: 'waiting', stage: GROCERY_CHART_STAGES[0] };

  function render() {
    figure.dataset.state = state.phase;
    if (state.phase === 'ready') showFrame(state.drawn, groceryChartFrame(state.stage, state.model));
  }

  figure.append(element('p', { className: 'grocery-note', text: groceryWaitingWords() }));
  container.replaceChildren(figure);
  render();

  return {
    showRuns(result) {
      if (state.phase !== 'waiting') return;
      if (result.problems) {
        state = { ...state, phase: 'missing' };
        figure.replaceChildren(element('p', { className: 'grocery-note', text: groceryMissingWords() }));
      } else {
        const drawn = drawRuns(result.found);
        state = { ...state, phase: 'ready', model: result.found, drawn };
        figure.replaceChildren(...drawn.parts);
      }
      render();
    },
    show(stage) {
      state = { ...state, stage };
      render();
    },
  };
}
