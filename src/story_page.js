import { METHOD, param } from './method.js';
import { blockGroupAt, createHexSpatialIndex } from './surface.js';
import { groceryRunsFor } from './ui/grocery/grocery_runs.js';
import { createGroceryChart } from './ui/grocery/grocery_chart.js';
import { modeBars, tripModes } from './ui/story/mode_bars.js';
import { outerBoundarySegments } from './geo.js';
import { surfaceMismatchWords, placeHoverWords, storyProgressWords } from './language.js';
import { reduceResidentState, residentStateFromUrl, residentStateToUrl } from './ui/shared/state.js';
import { tripDrawnGeometry } from './ui/map/routes.js';
import { tripSettings } from './ui/shared/lens.js';
import { createFoodMap } from './ui/map/map.js';
import { STEP_TRANSITION } from './ui/shared/transition.js';
import { mapPicture } from './ui/map/map_picture.js';
import { loadData, fetchJson, CIRCLE_GALLERY_SNAPSHOT } from './ui/shared/app_data.js';
import { createCircleGallery } from './ui/grocery/circle_gallery.js';
import { COMMITTED_MAP_STYLE } from './ui/map/committed_map_style.js';
import { STORY_DEFINITION } from './ui/story/story_definition.js';
import { mapStylesForSteps, stepView, storySteps, clampStep, storyTripFor, exploreTripFor, MAP_CARD_CHART } from './ui/story/story.js';
import { mapCardPanel } from './ui/story/map_card_panel.js';
import { createStoryReader, storyParagraphs } from './ui/story/story_reader.js';
import { cssVariablesFor } from './ui/map/map_theme.js';
import { legend, legendModel } from './ui/map/legend_view.js';
import { methodologyView } from './ui/methodology/methodology_view.js';
import { methodologyInputs } from './ui/methodology/methodology_inputs.js';
import { keepForRepeatVisits } from './ui/shared/offline.js';

const MAP_STYLE_BY_STEP = mapStylesForSteps(COMMITTED_MAP_STYLE);
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');
const PREFERS_DARK = window.matchMedia('(prefers-color-scheme: dark)');
const STORY_TRIP_ZOOM_OUT = 1;
const GROCERY_RUNS_AFTER_MS = 1500;

function colorScheme() {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === 'light' || chosen === 'dark') return chosen;
  return PREFERS_DARK.matches ? 'dark' : 'light';
}

function showMapColorsInPage(step) {
  const root = document.documentElement;
  const panel = getComputedStyle(root).getPropertyValue('--panel').trim();
  for (const [name, value] of Object.entries(cssVariablesFor(MAP_STYLE_BY_STEP[step], colorScheme(), { panel }))) root.style.setProperty(name, value);
}

function paragraphElement(text, className) {
  const paragraph = document.createElement('p');
  paragraph.className = className;
  paragraph.textContent = text;
  return paragraph;
}

function showStoryHead(intro) {
  document.getElementById('story-kicker').textContent = intro.kicker;
  document.getElementById('story-title').textContent = intro.title;
  document.getElementById('story-deck').textContent = intro.deck;
  document.getElementById('story-byline').textContent = intro.byline;
  document.getElementById('story-date').textContent = intro.date;
  document.getElementById('story-summary').replaceChildren(...storyParagraphs(intro.summary).map((paragraph) => paragraphElement(paragraph, 'story-summary-copy')));
  document.getElementById('story-closing').replaceChildren(...storyParagraphs(STORY_DEFINITION.closing).map((paragraph) => paragraphElement(paragraph, 'story-closing-copy')));
}

function keepStageUnderMasthead() {
  const masthead = document.querySelector('.site-masthead');
  const measure = () => document.body.style.setProperty('--stage-top', `${masthead.offsetHeight}px`);
  measure();
  new ResizeObserver(measure).observe(masthead);
}

async function showCircleGallery() {
  const hero = document.getElementById('circle-hero');
  const closingGallery = document.getElementById('circle-gallery');
  try {
    const gallery = await fetchJson(CIRCLE_GALLERY_SNAPSHOT);
    if (gallery.methodVersion !== METHOD.version) throw new Error('the circle gallery was built with another method');
    createCircleGallery(hero, gallery.cards);
    createCircleGallery(closingGallery, gallery.cards);
  } catch {
    hero.hidden = true;
    closingGallery.hidden = true;
  }
}

async function start() {
  keepStageUnderMasthead();
  showCircleGallery();
  showMapColorsInPage(clampStep(new URLSearchParams(window.location.search).get('step') ?? 1));
  showStoryHead(STORY_DEFINITION.intro);
  const data = await loadData();
  const context = { isInCounty: (point) => blockGroupAt(point, data.blockGroups) !== null };
  let state = residentStateFromUrl(window.location.search, context);
  const placesById = new Map(data.providers.map((provider) => [provider.id, provider]));

  const carlessPctByGeoid = new Map(data.blockGroups.map((blockGroup) => [blockGroup.geoid, blockGroup.carlessPct]));
  const carlessPctOf = (geoid) => carlessPctByGeoid.get(geoid) ?? null;
  const busNetworkRoutes = data.network.routes.map((route) => ({ color: route.color, parts: route.parts }));
  const hexGrid = createHexSpatialIndex(data.surface.grid, data.surface.cells);
  const surfaceMatches = data.surface.methodVersion === METHOD.version && data.surface.snapshotId === data.network.snapshotId;
  const stepCount = storySteps().length;
  const elements = {
    map: document.getElementById('story-map'),
    legend: document.getElementById('legend'),
    stageStep: document.getElementById('stage-step'),
    rail: document.getElementById('story-rail'),
    stageFrame: document.querySelector('.story-stage-frame'),
  };
  const groceryChart = createGroceryChart(document.getElementById('story-chart'));
  let groceryRunsShown = false;

  function showGroceryRuns() {
    const run = STORY_DEFINITION.groceryRun;
    if (groceryRunsShown || !run) return;
    groceryRunsShown = true;
    groceryChart.showRuns(groceryRunsFor(run, { network: data.network, method: METHOD, placesById }));
  }

  const foodMap = createFoodMap(elements.map, {
    controlsOverMap: () => [elements.legend.closest('.story-key')],
    hexGrid,
    cells: data.surface.cells,
    countyOutline: outerBoundarySegments(data.blockGroups.map((blockGroup) => blockGroup.geometry.coordinates)),
    paintSurface: surfaceMatches,
    mapStyle: MAP_STYLE_BY_STEP[state.step],
    colorScheme,
    animates: !REDUCED_MOTION.matches,
    onPlaceTapped: () => {},
    onEmptyMapTapped: () => {},
    describePlace: (placeId) => placeHoverWords(placesById.get(placeId)),
    onStartDropped: () => {},
    onTilesUnavailable: () => {},
    onViewChanged: () => {},
  });
  foodMap.setInteractive(false);

  const reader = createStoryReader(document.getElementById('story-text'), {
    steps: storySteps().map((step) => {
      const view = stepView(step);
      return { step, copy: view.copy, breakBefore: view.breakBefore };
    }),
    onStepReached: (step) => dispatch({ type: 'storyStepReached', step }),
    onProgress: (share) => elements.rail.style.setProperty('--progress', String(share)),
  });

  const storyTrips = new Map();
  function storyTrip(route) {
    const key = [route.from.lat, route.from.lon, route.placeId, route.leaveAt ?? ''].join('|');
    if (!storyTrips.has(key)) storyTrips.set(key, storyTripFor(route, { network: data.network, method: METHOD, placesById }));
    return storyTrips.get(key);
  }

  const drawnTrips = new Map();
  function storyDrawnTrip(route) {
    const trip = storyTrip(route);
    if (trip && !drawnTrips.has(trip)) drawnTrips.set(trip, tripDrawnGeometry(trip));
    return trip ? drawnTrips.get(trip) : null;
  }

  function showModeBars() {
    for (const step of storySteps()) {
      const view = stepView(step);
      const trip = view.modeBars && view.route ? storyTrip(view.route) : null;
      if (trip) reader.figureFor(step)?.replaceChildren(modeBars(tripModes(trip)));
    }
  }

  function showMapCards() {
    for (const step of storySteps()) {
      const view = stepView(step);
      if (view.chart !== MAP_CARD_CHART || !view.route) continue;
      const trip = exploreTripFor(view.route, { network: data.network, method: METHOD, placesById });
      if (trip) reader.figureFor(step)?.replaceChildren(mapCardPanel(trip, METHOD));
    }
  }

  let shownCamera = null;
  function moveCamera(view, routes) {
    const camera = view.route && view.zoomToRoute ? `route:${view.step}` : 'county';
    if (camera === shownCamera) return;
    const durationMs = shownCamera === null ? 0 : STEP_TRANSITION.cameraMs;
    shownCamera = camera;
    if (camera !== 'county') foodMap.fitTrip(routes.lines, { zoomOut: STORY_TRIP_ZOOM_OUT, durationMs });
    else foodMap.fitCounty({ durationMs });
  }

  let shownStep = null;
  function render() {
    const view = stepView(state.step);
    const settings = tripSettings(view, state);
    if (shownStep !== state.step) {
      shownStep = state.step;
      showMapColorsInPage(state.step);
    }
    const picture = mapPicture(state, { providers: data.providers, hexGrid, busNetworkRoutes, cells: data.surface.cells, method: METHOD, drawnTrip: view.route ? storyDrawnTrip(view.route) : null, carlessPctOf, lilaTracts: data.lilaTracts, view });
    const startShown = Boolean(view.route);
    foodMap.show({ ...picture, start: startShown ? picture.start : null, startCellIndex: startShown ? picture.startCellIndex : null, mapStyle: MAP_STYLE_BY_STEP[state.step] });
    moveCamera(view, view.route ? storyDrawnTrip(view.route) ?? picture.routes : picture.routes);
    elements.stageStep.textContent = storyProgressWords(state.step, stepCount);
    const key = legendModel(view, picture, { settings, method: METHOD, lineMin: param(METHOD, 'desertTransitMin'), paintSurface: surfaceMatches, mismatchWords: surfaceMismatchWords() });
    elements.legend.dataset.quiet = String(!key.isShown);
    if (key.isShown) legend(elements.legend, key);
    const showsChart = Boolean(view.chart) && view.chart !== MAP_CARD_CHART;
    elements.stageFrame.dataset.stage = showsChart ? 'chart' : 'map';
    if (showsChart) {
      showGroceryRuns();
      groceryChart.show(view.chart);
    }
    reader.showCurrent(state.step);
    reader.follow(state.step);
    foodMap.resize();
  }

  function dispatch(event) {
    const outcome = reduceResidentState(state, event, context);
    state = outcome.state;
    if (outcome.history !== 'none') window.history.replaceState(null, '', residentStateToUrl(state) || window.location.pathname);
    render();
  }

  methodologyView(document.getElementById('methodology'), {
    method: METHOD,
    inputs: methodologyInputs({ cells: data.surface.cells, blockGroups: data.blockGroups, network: data.network, method: METHOD }),
  });

  window.addEventListener('popstate', () => dispatch({ type: 'urlChanged', search: window.location.search }));
  function themeChanged() {
    showMapColorsInPage(state.step);
    foodMap.refreshColors();
  }
  PREFERS_DARK.addEventListener('change', themeChanged);
  new MutationObserver(themeChanged).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('resize', () => foodMap.resize());

  render();
  showModeBars();
  showMapCards();
  setTimeout(showGroceryRuns, GROCERY_RUNS_AFTER_MS);
  if (window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  document.body.dataset.ready = 'true';
}

keepForRepeatVisits();
start().catch((error) => {
  const message = document.getElementById('load-error');
  message.hidden = false;
  message.textContent = `The data did not load (${error.message}). Reload to try again.`;
  document.getElementById('loading').hidden = true;
});
