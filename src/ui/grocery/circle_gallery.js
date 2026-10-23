import { circleCardWords, circleGalleryWords } from '../../language.js';

export const CIRCLE_CARD_LOOK = Object.freeze({ cardPx: 124, frameMiles: 1.65, circleMiles: 1, storePx: 8, homePx: 8 });

const DRAWING_ORDER = Object.freeze(['car', 'bus', 'foot-to-bus', 'walk']);
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export function circleCardShapes(card, look = CIRCLE_CARD_LOOK) {
  const middle = look.cardPx / 2;
  const pixelsPerMile = middle / look.frameMiles;
  const toPixels = ([eastMiles, southMiles]) => [Number((middle + eastMiles * pixelsPerMile).toFixed(1)), Number((middle + southMiles * pixelsPerMile).toFixed(1))];
  const drawingRank = (line) => DRAWING_ORDER.indexOf(line.by);
  return {
    cardPx: look.cardPx,
    circle: { center: [middle, middle], radius: Number((look.circleMiles * pixelsPerMile).toFixed(2)) },
    lines: [...card.lines].sort((first, second) => drawingRank(first) - drawingRank(second)).map((line) => ({ by: line.by, points: line.points.map(toPixels) })),
    store: { center: [middle, middle], side: look.storePx },
    home: { center: toPixels(card.home), diameter: look.homePx },
  };
}

function svgElement(name, attributes) {
  const element = document.createElementNS(SVG_NAMESPACE, name);
  for (const [attribute, value] of Object.entries(attributes)) element.setAttribute(attribute, String(value));
  return element;
}

function pathThrough(points) {
  return `M${points.map(([across, down]) => `${across} ${down}`).join('L')}`;
}

function circleCardElement(card) {
  const shapes = circleCardShapes(card);
  const drawing = svgElement('svg', { class: 'circle-card', viewBox: `0 0 ${shapes.cardPx} ${shapes.cardPx}`, role: 'img', 'aria-label': circleCardWords(card) });
  const [centerAcross, centerDown] = shapes.circle.center;
  drawing.append(svgElement('circle', { class: 'circle-card-ring', cx: centerAcross, cy: centerDown, r: shapes.circle.radius }));
  for (const line of shapes.lines) drawing.append(svgElement('path', { class: `circle-card-line circle-card-${line.by}`, d: pathThrough(line.points) }));
  const halfSide = shapes.store.side / 2;
  drawing.append(svgElement('rect', { class: 'circle-card-store', x: centerAcross - halfSide, y: centerDown - halfSide, width: shapes.store.side, height: shapes.store.side, rx: 1 }));
  const [homeAcross, homeDown] = shapes.home.center;
  drawing.append(svgElement('circle', { class: 'circle-card-home', cx: homeAcross, cy: homeDown, r: shapes.home.diameter / 2 }));
  return drawing;
}

export function createCircleGallery(root, cards) {
  root.setAttribute('aria-label', circleGalleryWords(cards.length));
  const grid = document.createElement('div');
  grid.className = 'circle-gallery-grid';
  grid.append(...cards.map(circleCardElement));
  root.replaceChildren(grid);
}
