import { lensBinWords, lensBinShortWords, pastLineKeyWords, overlayKeyWords } from '../../language.js';
import { surfaceBins } from '../shared/lens.js';
import { element } from '../shared/dom.js';

function wordsForEachWidth(fullWords, shortWords) {
  return [element('span', { className: 'words-full', text: fullWords }), element('span', { className: 'words-short', text: shortWords, attributes: { 'aria-hidden': 'true' } })];
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

const HEXAGON_SWATCH_CORNERS = '6,0.5 11.2,3.5 11.2,9.5 6,12.5 0.8,9.5 0.8,3.5';

function hexagonSwatch(rampStep) {
  const swatch = document.createElementNS(SVG_NAMESPACE, 'svg');
  swatch.setAttribute('class', 'swatch');
  swatch.setAttribute('viewBox', '0 0 12 13');
  swatch.setAttribute('aria-hidden', 'true');
  const hexagon = document.createElementNS(SVG_NAMESPACE, 'polygon');
  hexagon.setAttribute('points', HEXAGON_SWATCH_CORNERS);
  hexagon.setAttribute('class', `swatch-fill ramp-${rampStep}`);
  swatch.append(hexagon);
  return swatch;
}

function swatchPart(name, attributes) {
  const part = document.createElementNS(SVG_NAMESPACE, name);
  for (const [attribute, value] of Object.entries(attributes)) part.setAttribute(attribute, value);
  return part;
}

const OVERLAY_SWATCH_PARTS = Object.freeze({
  highNeed: [['polygon', { points: HEXAGON_SWATCH_CORNERS, class: 'swatch-high-need-casing' }], ['polygon', { points: HEXAGON_SWATCH_CORNERS, class: 'swatch-high-need' }]],
  lilaTracts: [['rect', { x: '0.75', y: '1.25', width: '10.5', height: '10.5', class: 'swatch-lila' }]],
});

function overlayKey(overlay) {
  const swatch = swatchPart('svg', { class: 'swatch', viewBox: '0 0 12 13', 'aria-hidden': 'true' });
  swatch.append(...OVERLAY_SWATCH_PARTS[overlay].map(([name, attributes]) => swatchPart(name, attributes)));
  const words = overlayKeyWords(overlay);
  return element('span', { className: 'legend-key legend-overlay' }, [swatch, ...wordsForEachWidth(words.full, words.short)]);
}

export function legendModel(view, picture, { settings, method, lineMin, paintSurface, mismatchWords }) {
  const overlays = [...(picture.highNeedOutline ? ['highNeed'] : []), ...(picture.lilaTracts ? ['lilaTracts'] : [])];
  const colorsHexagons = Boolean(view.hexagons) && view.colorBy !== 'plain';
  return {
    isShown: colorsHexagons || overlays.length > 0,
    colorsHexagons,
    lens: view.colorBy === 'travel' ? settings.mapMode : view.colorBy,
    kinds: settings.kinds,
    bins: surfaceBins(view, settings.mapMode, method, lineMin),
    single: view.colorBy === 'pastLine' ? pastLineKeyWords(lineMin) : null,
    paintSurface,
    mismatchWords,
    spotlitBin: picture.spotlitBin ?? null,
    overlays,
  };
}

function legendKey(rampStep, fullWords, shortWords, isSpotlit = false) {
  return { id: `${rampStep}|${fullWords}|${shortWords}`, isSpotlit, make: () => element('span', { className: 'legend-key' }, [hexagonSwatch(rampStep), ...wordsForEachWidth(fullWords, shortWords)]) };
}

const LENSES_WITHOUT_FOOD_KINDS = Object.freeze(['carless']);

const PAST_LINE_SWATCH_STEP = 4;

function hexagonKeys({ lens, kinds, bins, single, spotlitBin }) {
  if (single) return [legendKey(PAST_LINE_SWATCH_STEP, single, single)];
  if (!bins || (kinds.length === 0 && !LENSES_WITHOUT_FOOD_KINDS.includes(lens))) return [];
  return bins.upperBounds.concat([Infinity]).map((upperBound, index) => legendKey(index + 1, lensBinWords(lens, bins.upperBounds, index, bins.lowerBound ?? null), lensBinShortWords(lens, bins.upperBounds, index, bins.lowerBound ?? null), index === spotlitBin));
}

function legendEntries({ lens, kinds, bins, single = null, paintSurface, mismatchWords, spotlitBin = null, colorsHexagons = true, overlays = [] }) {
  if (!paintSurface) return [{ id: `mismatch|${mismatchWords}`, isSpotlit: false, make: () => element('span', { text: mismatchWords }) }];
  return [
    ...(colorsHexagons ? hexagonKeys({ lens, kinds, bins, single, spotlitBin }) : []),
    ...overlays.map((overlay) => ({ id: `overlay|${overlay}`, isSpotlit: false, make: () => overlayKey(overlay) })),
  ];
}

const pendingLegends = new WeakMap();

function showLegend(container, entries, contents) {
  if (container.dataset.contents !== contents) container.replaceChildren(...entries.map((entry) => entry.make()));
  container.dataset.contents = contents;
  container.removeAttribute('data-swapping');
  container.toggleAttribute('data-spotlit', entries.some((entry) => entry.isSpotlit));
  [...container.children].forEach((child, index) => child.toggleAttribute('data-spotlit', entries[index].isSpotlit));
}

export function legend(container, model) {
  const entries = legendEntries(model);
  const contents = entries.map((entry) => entry.id).join('\n');
  const pending = pendingLegends.get(container);
  if (pending?.contents === contents) {
    pending.entries = entries;
    if (performance.now() - pending.startedAt > pending.fadeMs * 2) {
      clearTimeout(pending.timer);
      pendingLegends.delete(container);
      showLegend(container, entries, contents);
    }
    return;
  }
  clearTimeout(pending?.timer);
  pendingLegends.delete(container);
  const fadeMs = parseFloat(getComputedStyle(container).transitionDuration) * 1000;
  if ([contents, undefined].includes(container.dataset.contents) || !(fadeMs > 0)) return showLegend(container, entries, contents);
  container.setAttribute('data-swapping', '');
  const swap = { contents, entries, timer: null, fadeMs, startedAt: performance.now() };
  swap.timer = setTimeout(() => {
    pendingLegends.delete(container);
    showLegend(container, swap.entries, contents);
  }, fadeMs);
  pendingLegends.set(container, swap);
}
