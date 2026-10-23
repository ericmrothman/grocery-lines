import { timePieces } from '../../mobility.js';
import { minutesWords, modeBarWords, groceryBlockWords, groceryPartWords } from '../../language.js';
import { element } from '../shared/dom.js';
import { iconElement } from '../shared/icons.js';

const KEY_ORDER = Object.freeze(['walk', 'wait', 'ride', 'shop', 'drive', 'park']);
const SHORTEST_PIECE_MIN = 1 / 60;
const MODE_ICONS = Object.freeze({ drive: 'car', walk: 'walk', bus: 'bus' });

export function partsKey(parts) {
  const list = element('ul', { className: 'trip-order-key parts-key' });
  list.append(...parts.map((part) => {
    const item = element('li');
    const swatch = element('span', { className: `trip-key-swatch trip-piece-${part}` });
    swatch.setAttribute('aria-hidden', 'true');
    item.append(swatch, document.createTextNode(groceryPartWords(part)));
    return item;
  }));
  return list;
}

export function tripModes(trip) {
  return [{ mode: 'drive', leg: trip.drive }, { mode: 'walk', leg: trip.walk }, ...(trip.bus ? [{ mode: 'bus', leg: trip.bus }] : [])];
}

export function modeBars(legs) {
  const longest = Math.max(...legs.map(({ leg }) => leg.totalMin));
  const bars = element('div', { className: 'mode-bars' });
  const parts = new Set();
  bars.append(...legs.map(({ mode, leg }) => {
    const row = element('div', { className: 'mode-bar' });
    const track = element('div', { className: 'mode-bar-track' });
    const pieces = element('div', { className: 'mode-bar-pieces' });
    pieces.style.width = `${(leg.totalMin / longest) * 100}%`;
    pieces.append(...timePieces(leg).filter((piece) => piece.minutes >= SHORTEST_PIECE_MIN).map((piece) => {
      parts.add(piece.part);
      const span = element('span', { className: `trip-piece trip-piece-${piece.part}` });
      span.style.flexGrow = String(piece.minutes);
      span.title = groceryBlockWords({ part: piece.part, minutes: piece.minutes, route: piece.route, busLeavesAt: null });
      return span;
    }));
    track.append(pieces, element('span', { className: 'mode-bar-total', text: minutesWords(leg.totalMin) }));
    row.append(element('span', { className: 'mode-bar-icon' }, [iconElement(MODE_ICONS[mode])]), element('span', { className: 'mode-bar-name', text: modeBarWords(mode) }), track);
    return row;
  }));
  bars.append(partsKey(KEY_ORDER.filter((part) => parts.has(part))));
  return bars;
}
