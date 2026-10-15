import { mapCardMarkNameWords, minutesWords } from '../../language.js';
import { tripBars } from '../dossier/cards.js';
import { comparisonBarsView } from '../dossier/place_card_view.js';
import { element } from '../shared/dom.js';

const SHOWN_MODES = Object.freeze(['bus']);

export function rangeMarks(trip) {
  const departures = trip.bus?.departures;
  if (!departures || departures.bestMin === departures.worstMin) return [];
  return [
    { kind: 'median', minutes: trip.bus.totalMin, row: 0 },
    { kind: 'shortest', minutes: departures.bestMin, row: 1 },
    { kind: 'longest', minutes: departures.worstMin, row: 1 },
  ];
}

function markRow(marks, scaleMinutes) {
  const parts = marks.flatMap((mark) => {
    const left = `${(mark.minutes / scaleMinutes) * 100}%`;
    const words = element('span', { className: 'range-mark-words', attributes: { 'data-kind': mark.kind } }, [
      `${mapCardMarkNameWords(mark.kind)} `,
      element('span', { className: 'range-mark-minutes', text: minutesWords(mark.minutes) }),
    ]);
    const tip = element('span', { className: 'range-mark-tip' });
    words.style.left = left;
    tip.style.left = left;
    return [words, tip];
  });
  return element('span', { className: 'range-mark' }, parts);
}

function marksByRow(marks) {
  const rows = [];
  for (const mark of marks) (rows[mark.row] ??= []).push(mark);
  return rows;
}

function keepInsideItsRow(words) {
  words.style.marginLeft = '0px';
  const row = words.parentElement.getBoundingClientRect();
  const box = words.getBoundingClientRect();
  const overLeft = row.left - box.left;
  const overRight = box.right - row.right;
  words.style.marginLeft = `${overLeft > 0 ? overLeft : overRight > 0 ? -overRight : 0}px`;
}

function pointArrowsAtTheBusBar(panel) {
  const tips = [...panel.querySelectorAll('.range-mark-tip')];
  const busTrack = panel.querySelector('.bar-bus')?.parentElement;
  if (tips.length === 0 || !busTrack) return;
  const arrows = tips.map(() => element('span', { className: 'range-mark-arrow', attributes: { 'aria-hidden': 'true' } }));
  panel.append(...arrows);
  const placeArrows = () => {
    const panelBox = panel.getBoundingClientRect();
    const busTop = busTrack.getBoundingClientRect().top - panelBox.top;
    for (const words of panel.querySelectorAll('.range-mark-words')) keepInsideItsRow(words);
    tips.forEach((tip, index) => {
      const tipBox = tip.getBoundingClientRect();
      const top = tipBox.bottom - panelBox.top;
      arrows[index].style.left = `${tipBox.left - panelBox.left}px`;
      arrows[index].style.top = `${top}px`;
      arrows[index].style.height = `${Math.max(0, busTop - top)}px`;
    });
  };
  new ResizeObserver(placeArrows).observe(panel);
}

export function mapCardPanel(trip, method) {
  const bars = tripBars(trip, method);
  const leadRows = marksByRow(rangeMarks(trip)).map((marks) => markRow(marks, bars.axis.scaleMinutes));
  const panel = element('figure', { className: 'map-card-panel' }, [comparisonBarsView(bars, { explainsRange: false, shownModes: SHOWN_MODES, leadRows })]);
  if (leadRows.length > 0) pointArrowsAtTheBusBar(panel);
  return panel;
}
