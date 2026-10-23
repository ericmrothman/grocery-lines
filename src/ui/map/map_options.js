import { param } from '../../method.js';
import { SCENARIO_TRANSIT_THRESHOLDS_MIN } from '../../audit.js';
import { cutoffOptionWords } from '../../language.js';

export function mapOptionsModel(state, method) {
  const standardMin = param(method, 'desertTransitMin');
  const lineMin = state.busLineMin ?? standardMin;
  return {
    open: state.mapOptionsOpen,
    highNeedView: state.highNeedView,
    sizeByHomes: state.sizeByHomes,
    busRoutes: state.exploreBusLines,
    lilaTracts: state.lilaTracts,
    cutoffs: SCENARIO_TRANSIT_THRESHOLDS_MIN.map((minutes) => ({ minutes, words: cutoffOptionWords(minutes, standardMin), pressed: minutes === lineMin })),
  };
}

function cutoffButton(cutoff, onCutoffChosen) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.cutoff = String(cutoff.minutes);
  button.textContent = cutoff.words;
  button.addEventListener('click', () => onCutoffChosen(cutoff.minutes));
  return button;
}

export function createMapOptions(root, { onToggled, onSizeByHomesToggled, onBusRoutesToggled, onHighNeedViewChosen, onLilaTractsToggled, onCutoffChosen, onDownloadCsv, onClosed }) {
  const toggle = root.querySelector('#map-options-toggle');
  const menu = root.querySelector('#map-options-menu');
  const sizeButtons = [...root.querySelectorAll('[data-hexagon-size]')];
  let showsSizeByHomes = false;
  const busRoutes = root.querySelector('#show-bus-routes');
  const cutoffs = root.querySelector('#cutoff-choices');
  const highNeedButtons = [...root.querySelectorAll('[data-high-need-view]')];
  const lilaTracts = root.querySelector('#show-lila-tracts');
  toggle.addEventListener('click', onToggled);
  for (const button of sizeButtons) button.addEventListener('click', () => {
    if ((button.dataset.hexagonSize === 'population') !== showsSizeByHomes) onSizeByHomesToggled();
  });
  busRoutes.addEventListener('change', onBusRoutesToggled);
  for (const button of highNeedButtons) button.addEventListener('click', () => onHighNeedViewChosen(button.dataset.highNeedView));
  lilaTracts.addEventListener('change', onLilaTractsToggled);
  root.querySelector('#download-high-need-csv').addEventListener('click', onDownloadCsv);
  document.addEventListener('pointerdown', (event) => {
    if (!menu.hidden && !root.contains(event.target)) onClosed();
  });
  return {
    show(model) {
      if (cutoffs.childElementCount !== model.cutoffs.length) cutoffs.replaceChildren(...model.cutoffs.map((cutoff) => cutoffButton(cutoff, onCutoffChosen)));
      for (const cutoff of model.cutoffs) cutoffs.querySelector(`[data-cutoff="${cutoff.minutes}"]`).setAttribute('aria-pressed', String(cutoff.pressed));
      toggle.setAttribute('aria-expanded', String(model.open));
      menu.hidden = !model.open;
      showsSizeByHomes = model.sizeByHomes;
      for (const button of sizeButtons) button.setAttribute('aria-pressed', String((button.dataset.hexagonSize === 'population') === model.sizeByHomes));
      busRoutes.checked = model.busRoutes;
      for (const button of highNeedButtons) button.setAttribute('aria-pressed', String(button.dataset.highNeedView === model.highNeedView));
      lilaTracts.checked = model.lilaTracts;
    },
    firstOption: () => menu.querySelector('button:not([hidden]), input'),
    toggleButton: () => toggle,
  };
}
