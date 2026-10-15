import { METHOD, param } from './method.js';
import { blockGroupAt, createHexSpatialIndex } from './surface.js';
import { estimateTrip, fastestTrips } from './mobility.js';
import { outerBoundarySegments } from './geo.js';
import { originWords, searchResultWords, surfaceMismatchWords, peekHintWords, placeHoverWords, hiddenSelectionWords, lockedTripWords, pinCountWords, cellHoverWords, mapInstructionWords, COUNTY_FINDING_LABELS } from './language.js';
import { reduceResidentState, residentStateFromUrl, residentStateToUrl, shareableUrl, openedOnExample, REST_FOCUS } from './ui/shared/state.js';
import { reduceDrawer, drawerAfter, drawerHeightPx, drawerContent } from './ui/dossier/drawer.js';
import { tripCard } from './ui/dossier/cards.js';
import { tripDrawnGeometry } from './ui/map/routes.js';
import { createSearchRateLimiter, searchForOrigin } from './ui/dossier/search.js';
import { tripSettings, nearestPlaceIdForCell } from './ui/shared/lens.js';
import { createFoodMap } from './ui/map/map.js';
import { mapPicture } from './ui/map/map_picture.js';
import { loadData, fetchJson } from './ui/shared/app_data.js';
import { keepForRepeatVisits } from './ui/shared/offline.js';
import { fillIconSlots } from './ui/shared/icons.js';
import { highNeedCells, highNeedCsv, isHighNeedCell } from './ui/map/high_need.js';
import { COMMITTED_MAP_STYLE } from './ui/map/committed_map_style.js';
import { mapPageMapStyle, mapPageView } from './ui/story/story.js';
import { STORY_DEFINITION } from './ui/story/story_definition.js';

const MAP_STYLE = mapPageMapStyle(COMMITTED_MAP_STYLE);
import { cssVariablesFor } from './ui/map/map_theme.js';
import { placeSummary, placeCard } from './ui/dossier/place_card_view.js';
import { legend, legendModel } from './ui/map/legend_view.js';
import { countyFindingModel, countyFinding, countyFindingSummary, focusBackButton, focusBackSpace } from './ui/dossier/county_finding.js';
import { inspectorViewModel } from './ui/dossier/inspector.js';
import { mapOptionsModel, createMapOptions } from './ui/map/map_options.js';
import { element, withStrongPhrases } from './ui/shared/dom.js';

const WIDE_SCREEN = window.matchMedia('(min-width: 900px)');
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');
const PREFERS_DARK = window.matchMedia('(prefers-color-scheme: dark)');

function colorScheme() {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === 'light' || chosen === 'dark') return chosen;
  return PREFERS_DARK.matches ? 'dark' : 'light';
}

function showMapColorsInPage() {
  const root = document.documentElement;
  const panel = getComputedStyle(root).getPropertyValue('--panel').trim();
  for (const [name, value] of Object.entries(cssVariablesFor(COMMITTED_MAP_STYLE, colorScheme(), { panel }))) root.style.setProperty(name, value);
  for (const [name, value] of Object.entries(cssVariablesFor(MAP_STYLE, colorScheme(), { panel }))) if (name.startsWith('--ramp-') || name.startsWith('--high-need')) root.style.setProperty(name, value);
}

async function start() {
  showMapColorsInPage();
  const data = await loadData();
  const surfaceMatches = data.surface.methodVersion === METHOD.version && data.surface.snapshotId === data.network.snapshotId;
  const context = { isInCounty: (point) => blockGroupAt(point, data.blockGroups) !== null };
  const placesById = new Map(data.providers.map((provider) => [provider.id, provider]));
  const countyOutline = outerBoundarySegments(data.blockGroups.map((blockGroup) => blockGroup.geometry.coordinates));
  const rateLimiter = createSearchRateLimiter(() => performance.now());
  const supermarketNameOf = (placeId) => placesById.get(placeId)?.name ?? placeId;
  const carlessPctByGeoid = new Map(data.blockGroups.map((blockGroup) => [blockGroup.geoid, blockGroup.carlessPct]));
  const carlessPctOf = (geoid) => carlessPctByGeoid.get(geoid) ?? null;
  const supermarkets = data.providers.filter((provider) => provider.kind === 'supermarket');

  let state = residentStateFromUrl(window.location.search, context);
  if (!window.location.search) state = openedOnExample(state, fastestTrips(state.origin.point, supermarkets, data.network, METHOD, { period: state.period, count: 1, rankedBy: state.mapMode })[0]?.inputs.destination.id ?? null);
  let drawerSnap = 'peek';

  const elements = {
    searchForm: document.getElementById('search-form'),
    searchInput: document.getElementById('search-input'),
    searchButton: document.getElementById('search-button'),
    searchMessage: document.getElementById('search-message'),
    locateButton: document.getElementById('locate-button'),
    mapView: document.getElementById('map-view'),
    map: document.getElementById('map'),
    travelLocked: document.getElementById('travel-locked'),
    exploreViews: document.getElementById('explore-views'),
    travelControls: document.getElementById('travel-controls'),
    drawer: document.getElementById('drawer'),
    drawerHandle: document.getElementById('drawer-handle'),
    drawerBody: document.getElementById('drawer-body'),
    legend: document.getElementById('legend'),
    tileNotice: document.getElementById('tile-notice'),
    filterMessage: document.getElementById('filter-message'),
    showRoute: document.getElementById('show-route'),
    kindButtons: [...document.querySelectorAll('[data-kind]')],
    modeButtons: [...document.querySelectorAll('[data-map-mode]')],
    periodButtons: [...document.querySelectorAll('[data-period]')],
    shareButton: document.getElementById('share-button'),
    shareMessage: document.getElementById('share-message'),
  };

  const busNetworkRoutes = data.network.routes.map((route) => ({ color: route.color, parts: route.parts }));

  const hexGrid = createHexSpatialIndex(data.surface.grid, data.surface.cells);
  const neighborhoodCentre = (point) => hexGrid.nearestCellCentre(point);
  const addressFor = (residentState) => residentStateToUrl(residentState, { neighborhoodOf: neighborhoodCentre }) || window.location.pathname;
  window.history.replaceState(null, '', addressFor(state));
  const foodMap = createFoodMap(document.getElementById('map'), {
    hexGrid,
    cells: data.surface.cells,
    countyOutline,
    paintSurface: surfaceMatches,
    mapStyle: MAP_STYLE,
    colorScheme,
    onPlaceTapped: (placeId) => {
      if (currentView().routes) dispatch({ type: 'placeSelected', placeId });
    },
    onEmptyMapTapped: () => {
      if (state.focus.kind !== 'rest') dispatch({ type: 'focusCleared' });
    },
    onPointTapped: routeFromCell,
    describePlace: (placeId) => placeHoverWords(placesById.get(placeId)),
    describeCell,
    onStartDropped: (point) => routeFrom('map-point', point),
    onTilesUnavailable: () => {
      elements.tileNotice.hidden = false;
    },
    onViewChanged: () => updateShowRoute(),
    controlsOverMap: () => [elements.showRoute, document.querySelector('.map-key'), document.querySelector('.map-options-card'), document.getElementById('map-options-menu')],
    animates: !REDUCED_MOTION.matches,
  });

  let shownPicture = null;
  let shownCamera = 'county';

  function routeFromCell(point) {
    const cellIndex = context.isInCounty(point) ? hexGrid.nearestCellIndex(point) : null;
    const cell = cellIndex === null ? null : data.surface.cells[cellIndex];
    if (!cell || (shownPicture && !shownPicture.canInspect(cell))) {
      if (state.focus.kind !== 'rest') dispatch({ type: 'focusCleared' });
      return;
    }
    dispatch({ type: 'cellTapped', point: { lat: cell.lat, lon: cell.lon }, placeId: nearestPlaceIdForCell(cell, currentTripSettings()) });
  }

  function currentTripSettings() {
    return tripSettings(currentView(), state);
  }

  function drawnTrip() {
    if (!currentView().routes) return null;
    const trip = state.focus.kind === 'audit' ? selectedTrip() : null;
    return trip ? tripDrawnGeometry(trip) : null;
  }

  function updateShowRoute() {
    const drawn = drawnTrip();
    const hidden = !drawn || drawn.lines.length === 0 || foodMap.showsWholeTrip(drawn.lines);
    if (elements.showRoute.hidden === hidden) return;
    elements.showRoute.hidden = hidden;
    foodMap.controlsChanged();
  }

  function selectedTrip() {
    const place = state.focus.kind === 'audit' && placesById.get(state.focus.placeId);
    if (!place) return null;
    return estimateTrip(state.origin.point, place, data.network, METHOD, { period: currentTripSettings().period });
  }

  function selectedCard() {
    const trip = selectedTrip();
    if (!trip) return null;
    return tripCard({ place: trip.inputs.destination, trip, method: METHOD, instant: new Date(), streets: data.network.streets });
  }

  function findingFor() {
    return countyFindingModel({ cells: data.surface.cells, carlessPctOf, method: METHOD, busLineMin: state.busLineMin, period: currentTripSettings().period, highNeedOnly: state.highNeedView === 'only' });
  }

  function stepAtRestNodes() {
    return currentView().panel === 'finding' ? [focusBackSpace(), countyFinding(findingFor())] : [];
  }

  function stepAtRestSummary() {
    return currentView().panel === 'finding' ? countyFindingSummary(findingFor(), expandDrawer) : null;
  }

  function expandDrawer() {
    snapDrawer({ type: 'summaryTapped' });
  }

  function backButton(behind) {
    return focusBackButton(behind, () => dispatch({ type: 'focusBack' }));
  }

  function inspectedCardNodes(inspected) {
    if (inspected.kind === 'rest') return stepAtRestNodes();
    const steps = { openSteps: state.openSteps, onStepsToggled: (mode) => dispatch({ type: 'stepsToggled', mode }) };
    return [backButton(REST_FOCUS), placeCard(inspected.card, steps)];
  }

  function peekSummary(inspected) {
    if (inspected.kind === 'rest') return stepAtRestSummary();
    return placeSummary(inspected.card, 0, expandDrawer);
  }

  function inspectorContent() {
    const inspected = inspectorViewModel(state.focus, { placeCardFor: selectedCard });
    const content = WIDE_SCREEN.matches ? 'card' : drawerContent(drawerSnap, true);
    if (content === 'card') return inspectedCardNodes(inspected);
    const summary = peekSummary(inspected);
    return summary ? [summary, element('p', { className: 'peek-hint', text: peekHintWords() })] : [];
  }

  function downloadHighNeedCsv() {
    const lineMin = cutoffMin();
    const { period } = currentTripSettings();
    const rows = highNeedCells(data.surface.cells, { carlessPctOf, method: METHOD, lineMin, period });
    const csv = highNeedCsv(rows, { supermarketNameOf, lineMin, period, methodVersion: data.surface.methodVersion, inputs: data.surface.inputs });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = COUNTY_FINDING_LABELS.csvFileName;
    link.click();
    requestAnimationFrame(() => URL.revokeObjectURL(link.href));
  }

  function coveredByDrawerPx(isEmpty) {
    return isEmpty ? elements.drawer.getBoundingClientRect().height : drawerHeightPx(drawerSnap, window.innerHeight);
  }

  function snapDrawer(gesture) {
    drawerSnap = reduceDrawer(drawerSnap, gesture);
    if (drawerSnap !== 'peek' && state.mapOptionsOpen && !WIDE_SCREEN.matches) dispatch({ type: 'mapOptionsClosed' });
    else renderDrawer();
  }

  function renderDrawer() {
    elements.drawer.style.setProperty('--drawer-height', `${drawerHeightPx(drawerSnap, window.innerHeight)}px`);
    elements.drawer.dataset.snap = drawerSnap;
    const nodes = inspectorContent();
    elements.drawer.dataset.empty = String(nodes.length === 0);
    elements.drawerBody.replaceChildren(...nodes);
    foodMap.coverBottom(WIDE_SCREEN.matches ? 0 : coveredByDrawerPx(nodes.length === 0));
    updateShowRoute();
  }

  function renderMap() {
    const view = currentView();
    const settings = currentTripSettings();
    shownPicture = { ...mapPicture(state, { providers: data.providers, hexGrid, busNetworkRoutes, cells: data.surface.cells, method: METHOD, drawnTrip: drawnTrip(), carlessPctOf, lilaTracts: data.lilaTracts, view }), mapStyle: MAP_STYLE };
    foodMap.show(shownPicture);
    hoveredCell = { index: null, words: null };
    const key = legendModel(view, shownPicture, { settings, method: METHOD, lineMin: cutoffMin(), paintSurface: surfaceMatches, mismatchWords: surfaceMismatchWords() });
    elements.legend.dataset.quiet = String(!key.isShown);
    if (key.isShown) legend(elements.legend, key);
  }

  function cutoffMin() {
    return state.busLineMin ?? param(METHOD, 'desertTransitMin');
  }

  function nearestSupermarketFrom(point) {
    if (!context.isInCounty(point)) return null;
    const { period, mapMode } = currentTripSettings();
    const rankedBy = mapMode;
    return fastestTrips(point, supermarkets, data.network, METHOD, { period, count: 1, rankedBy })[0]?.inputs.destination.id ?? null;
  }

  function routeFrom(source, point, details = {}) {
    dispatch({ type: 'originSet', source, point, ...details, placeId: nearestSupermarketFrom({ lat: point.lat, lon: point.lon, source }) });
  }

  function currentView() {
    return mapPageView(STORY_DEFINITION, state.exploreView, { sizeByHomes: state.sizeByHomes, busRoutes: state.exploreBusLines, lilaTracts: state.lilaTracts, highNeedView: state.highNeedView });
  }

  function travelPosture(view) {
    if (view.explore) return 'explore';
    return view.lockedTrip ? 'locked' : 'chosen';
  }

  function lockedWords(view) {
    if (view.hexagons) return lockedTripWords(view.lockedTrip.mapMode);
    return pinCountWords(view.pinKinds.map((kind) => ({ kind, count: data.providers.filter((provider) => provider.kind === kind).length })));
  }

  function exploreViewButtons(view) {
    const shown = [...elements.exploreViews.children].map((button) => button.textContent);
    if (shown.join('|') !== view.explore.labels.join('|')) {
      elements.exploreViews.replaceChildren(...view.explore.labels.map((label, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', () => dispatch({ type: 'exploreViewChosen', view: index }));
        return button;
      }));
    }
    [...elements.exploreViews.children].forEach((button, index) => button.setAttribute('aria-pressed', String(index === view.explore.chosen)));
  }

  function renderTravelControls(view) {
    const posture = travelPosture(view);
    elements.travelControls.dataset.posture = posture;
    for (const child of elements.travelControls.querySelectorAll(':scope > [data-shows]')) child.hidden = !child.dataset.shows.split(' ').includes(posture);
    if (posture === 'locked') elements.travelLocked.textContent = lockedWords(view);
    if (posture === 'explore') exploreViewButtons(view);
  }

  let hoveredCell = { index: null, words: null };

  function describeCell(cellIndex) {
    if (state.view !== 'map') return null;
    if (hoveredCell.index === cellIndex) return hoveredCell.words;
    const cell = data.surface.cells[cellIndex];
    const isShown = shownPicture?.canInspect(cell) ?? false;
    const highNeed = isShown && isHighNeedCell(cell, { carlessPctOf, method: METHOD, lineMin: cutoffMin(), period: currentTripSettings().period });
    const words = isShown ? cellHoverWords({ households: cell.households, carlessPct: carlessPctOf(cell.geoid), highNeed }) : null;
    hoveredCell = { index: cellIndex, words };
    return words;
  }


  function renderControls() {
    for (const box of elements.kindButtons) box.checked = state.kinds.includes(box.dataset.kind);
    for (const button of elements.modeButtons) button.setAttribute('aria-pressed', String(state.mapMode === button.dataset.mapMode));
    for (const button of elements.periodButtons) button.setAttribute('aria-pressed', String(state.period === button.dataset.period));
    renderTravelControls(currentView());
    mapOptions.show(mapOptionsModel(state, METHOD));
  }

  function render() {
    renderControls();
    renderMap();
    renderDrawer();
    foodMap.resize();
    updateShowRoute();
  }

  function focusSoon(target) {
    requestAnimationFrame(() => (typeof target === 'function' ? target() : target)?.focus());
  }

  function runEffects(effects) {
    for (const effect of effects) {
      if (effect === 'fit-county') foodMap.fitCounty();
      if (effect === 'focus-search') elements.searchInput.focus();
      if (effect === 'focus-card') focusSoon(() => {
        elements.drawerBody.scrollTop = 0;
        return { focus: () => document.getElementById('place-card')?.focus({ preventScroll: true }) };
      });
      if (effect === 'focus-story') focusSoon(() => document.getElementById('county-finding') ?? elements.map);
      if (effect === 'focus-map') focusSoon(elements.map);
      if (effect === 'focus-map-options') focusSoon(mapOptions.firstOption);
      if (effect === 'focus-map-options-toggle') focusSoon(mapOptions.toggleButton);
      if (effect.startsWith('focus-steps-toggle:')) focusSoon(() => document.querySelector(`#place-card [data-steps-mode="${effect.split(':')[1]}"]`));
      if (effect === 'request-location') requestLocation();
    }
  }

  function showOriginMessage(event) {
    if (event.type === 'locateRequested') {
      elements.searchMessage.classList.add('is-pending');
      elements.searchMessage.textContent = 'Finding your location…';
      return;
    }
    if (event.type !== 'originSet' && event.type !== 'locationDenied') return;
    elements.searchMessage.classList.remove('is-pending');
    elements.searchMessage.textContent = state.origin.notice ? originWords(state.origin).notice : '';
  }

  function closeCardHiddenByFilter() {
    const place = state.focus.kind === 'audit' && placesById.get(state.focus.placeId);
    if (!place || state.kinds.includes(place.kind)) return;
    elements.filterMessage.textContent = hiddenSelectionWords(place.name, place.kind);
    state = reduceResidentState(state, { type: 'focusCleared' }, context).state;
  }

  function dispatch(event) {
    elements.filterMessage.textContent = '';
    const outcome = reduceResidentState(state, event, context);
    state = outcome.state;
    drawerSnap = drawerAfter(drawerSnap, event);
    showOriginMessage(event);
    if (event.type === 'kindsToggled') closeCardHiddenByFilter();
    if (outcome.history === 'push') window.history.pushState(null, '', addressFor(state));
    if (outcome.history === 'replace') window.history.replaceState(null, '', addressFor(state));
    runEffects(outcome.effects);
    if (event.type === 'originSet' && state.origin.status !== 'off-county') foodMap.keepInView(state.origin.point);
    render();
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      dispatch({ type: 'locationDenied' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => routeFrom('gps', { lat: position.coords.latitude, lon: position.coords.longitude }),
      () => dispatch({ type: 'locationDenied' }),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    );
  }

  elements.searchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    elements.searchButton.disabled = true;
    elements.searchMessage.classList.add('is-pending');
    elements.searchMessage.textContent = 'Searching…';
    const result = await searchForOrigin(elements.searchInput.value, { zipCentroids: data.zipCentroids, rateLimiter, fetchJson, isInCounty: context.isInCounty });
    elements.searchButton.disabled = false;
    elements.searchMessage.classList.remove('is-pending');
    elements.searchMessage.textContent = result.status === 'found' ? '' : searchResultWords(result);
    if (result.status !== 'found') return;
    if (state.view !== 'map') dispatch({ type: 'mapViewOpened' });
    routeFrom(result.point.source, result.point, { label: result.label, zip: result.zip });
  });
  elements.locateButton.addEventListener('click', () => dispatch({ type: 'locateRequested' }));
  document.getElementById('home-link').addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    elements.searchInput.value = '';
    elements.searchMessage.textContent = '';
    dispatch({ type: 'homeOpened' });
  });
  const mapOptions = createMapOptions(document.getElementById('map-options'), {
    onToggled: () => dispatch({ type: 'mapOptionsToggled' }),
    onSizeByHomesToggled: () => dispatch({ type: 'sizeByHomesToggled' }),
    onBusRoutesToggled: () => dispatch({ type: 'exploreBusLinesToggled' }),
    onHighNeedViewChosen: (view) => dispatch({ type: 'highNeedViewChosen', view }),
    onLilaTractsToggled: () => dispatch({ type: 'lilaTractsToggled' }),
    onCutoffChosen: (minutes) => dispatch({ type: 'busLineChosen', minutes }),
    onDownloadCsv: () => downloadHighNeedCsv(),
    onClosed: () => dispatch({ type: 'mapOptionsClosed' }),
  });
  function highlightRangeNote(mode) {
    document.querySelector(`#place-card [data-show-mode-block="${mode}"]`)?.focus({ preventScroll: true });
    const rangeNote = document.querySelector(`#mode-block-${mode} .mode-note`);
    if (!rangeNote) return;
    rangeNote.addEventListener('animationend', () => rangeNote.classList.remove('is-range-highlighted'), { once: true });
    rangeNote.classList.add('is-range-highlighted');
  }

  elements.drawerBody.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-show-mode-block]');
    if (!trigger) return;
    const mode = trigger.dataset.showModeBlock;
    dispatch({ type: 'stepsOpened', mode });
    requestAnimationFrame(() => highlightRangeNote(mode));
  });
  elements.showRoute.addEventListener('click', () => {
    const drawn = drawnTrip();
    if (drawn) foodMap.fitTrip(drawn.lines);
  });
  for (const box of elements.kindButtons) box.addEventListener('change', () => dispatch({ type: 'kindsToggled', kind: box.dataset.kind }));
  for (const button of elements.modeButtons) button.addEventListener('click', () => dispatch({ type: 'mapModeChanged', mode: button.dataset.mapMode }));
  for (const button of elements.periodButtons) button.addEventListener('click', () => dispatch({ type: 'periodChanged', period: button.dataset.period }));
  elements.shareButton.addEventListener('click', async () => {
    const link = new URL(shareableUrl(state, { neighborhoodOf: neighborhoodCentre }) || window.location.pathname, window.location.href).toString();
    try {
      await navigator.clipboard.writeText(link);
      elements.shareMessage.textContent = 'Link copied.';
    } catch {
      elements.shareMessage.textContent = link;
    }
  });

  let drawerDrag = null;
  elements.drawerHandle.addEventListener('pointerdown', (event) => {
    elements.drawerHandle.setPointerCapture(event.pointerId);
    drawerDrag = { startY: event.clientY, startHeightPx: elements.drawer.getBoundingClientRect().height, moved: false };
    elements.drawer.classList.add('is-dragging');
  });
  elements.drawerHandle.addEventListener('pointermove', (event) => {
    if (!drawerDrag) return;
    const change = drawerDrag.startY - event.clientY;
    if (Math.abs(change) >= 6) drawerDrag.moved = true;
    if (drawerDrag.moved) elements.drawer.style.setProperty('--drawer-height', `${drawerDrag.startHeightPx + change}px`);
  });
  elements.drawerHandle.addEventListener('pointerup', () => {
    if (!drawerDrag) return;
    elements.drawer.classList.remove('is-dragging');
    const heightPx = elements.drawer.getBoundingClientRect().height;
    const gesture = drawerDrag.moved ? { type: 'dragEnded', heightPx, viewportHeightPx: window.innerHeight } : { type: 'handleTapped' };
    drawerDrag = null;
    snapDrawer(gesture);
  });

  document.addEventListener('keydown', (event) => {
    const typing = event.target instanceof Element && event.target.closest('input, textarea');
    if (event.key === 'Escape') {
      event.preventDefault();
      if (foodMap.cancelStartDrag()) return;
      dispatch({ type: 'escapePressed' });
      return;
    }
    if (typing) return;
    if (event.key === '/') {
      event.preventDefault();
      elements.searchInput.focus();
    }
    if (event.key === '?' && state.view === 'map' && state.focus.kind === 'audit') dispatch({ type: 'stepsToggled', mode: document.querySelector('#place-card [data-steps-mode="bus"]') ? 'bus' : 'car' });
  });

  window.addEventListener('popstate', () => dispatch({ type: 'urlChanged', search: window.location.search }));
  function themeChanged() {
    showMapColorsInPage();
    foodMap.refreshColors();
  }
  PREFERS_DARK.addEventListener('change', themeChanged);
  new MutationObserver(themeChanged).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  WIDE_SCREEN.addEventListener('change', render);
  window.addEventListener('resize', () => renderDrawer());

  render();
  document.body.dataset.ready = 'true';
}

keepForRepeatVisits();
fillIconSlots();
document.getElementById('map-instruction').replaceChildren(...withStrongPhrases(mapInstructionWords()));
start().catch((error) => {
  const message = document.getElementById('load-error');
  message.hidden = false;
  message.textContent = `The data did not load (${error.message}). Reload to try again.`;
  document.getElementById('loading').hidden = true;
});
