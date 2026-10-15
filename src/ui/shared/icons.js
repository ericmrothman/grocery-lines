import { ICON_GRID_UNITS, ROUTE_ICON_PATHS } from '../map/route_icons.js';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export const ICON_PATHS = Object.freeze({
  ...ROUTE_ICON_PATHS,
  wait: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z',
  park: 'M13 3H6v18h4v-6h3c3.31 0 6-2.69 6-6s-2.69-6-6-6zm.2 8H10V7h3.2c1.1 0 2 .9 2 2s-.9 2-2 2z',
  transfer: 'M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z',
  download: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z',
  phone: 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z',
});

export const KIND_MARKS = Object.freeze({
  supermarket: { shape: 'rect', attributes: { x: '6', y: '6', width: '12', height: '12' } },
  pantry: { shape: 'circle', attributes: { cx: '12', cy: '12', r: '6.5' } },
  'other-retailer': { shape: 'polygon', attributes: { points: '12,4.5 19.5,12 12,19.5 4.5,12' } },
});

function svgPart(name, attributes, page) {
  const part = page.createElementNS(SVG_NAMESPACE, name);
  for (const [attribute, value] of Object.entries(attributes)) part.setAttribute(attribute, value);
  return part;
}

function iconFrame(className, page) {
  return svgPart('svg', { class: className, viewBox: `0 0 ${ICON_GRID_UNITS} ${ICON_GRID_UNITS}`, 'aria-hidden': 'true', focusable: 'false' }, page);
}

export function iconElement(name, page = globalThis.document) {
  const path = ICON_PATHS[name];
  if (!path) throw new Error(`No icon named ${name}`);
  const icon = iconFrame(`icon icon-${name}`, page);
  icon.append(svgPart('path', { d: path }, page));
  return icon;
}

export function kindMarkElement(kind, page = globalThis.document) {
  const mark = KIND_MARKS[kind];
  if (!mark) throw new Error(`No mark for food kind ${kind}`);
  const icon = iconFrame(`kind-mark kind-mark-${kind}`, page);
  icon.append(svgPart(mark.shape, mark.attributes, page));
  return icon;
}

export function fillIconSlots(root = globalThis.document) {
  for (const slot of root.querySelectorAll('[data-icon]')) slot.replaceChildren(iconElement(slot.dataset.icon));
  for (const slot of root.querySelectorAll('[data-kind-mark]')) slot.replaceChildren(kindMarkElement(slot.dataset.kindMark));
}
