import { sideBySideLines } from './route_offsets.js';
import { STEP_TRANSITION, transitionLengthMs, presenceAfter, presenceNow, glideAfter, glideMarks } from '../shared/transition.js';
import { compileMapStyle, styleChanges, layerAboveSurface, SURFACE_LAYER_ID } from './map_style.js';
import { surfaceFill, paletteFor, overlayLook, groundColor } from './map_theme.js';
import { parseColor } from './color.js';
import { linesFeatures, busNetworkFeatures, highNeedFeatures, lilaTractFeatures, startCellFeatures } from './map_features.js';
import { createHexSurface } from './hex_surface.js';
import { createOverlayPainter } from './map_overlay.js';
import { createMapInteraction } from './map_interaction.js';

const BASEMAP_FILE = new URL('../../../snapshots/montgomery-vector@2026-10-06.pmtiles', import.meta.url).href;
const BASEMAP_GLYPHS = `${new URL('../../../vendor/basemap-fonts/', import.meta.url).href}{fontstack}/{range}.pbf`;
const BASEMAP_ATTRIBUTION = '<a href="https://www.openstreetmap.org/copyright">&copy; OpenStreetMap</a> contributors, <a href="https://protomaps.com">Protomaps</a>';
const CLOSEST_ZOOM = 17;
const ZOOM_LEVELS_WIDER_THAN_COUNTY = 1;
const ROOM_AROUND_COUNTY_SHARE = 0.5;
const LANES = Object.freeze({ laneSpacingPx: 3, touchingPx: 3 });
const TRIP_FIT_PADDING_PX = 40;
const STRESSED_START_CELL_SCALE = 2;
const easeInOutCubic = (share) => (share < 0.5 ? 4 * share ** 3 : 1 - (-2 * share + 2) ** 3 / 2);
const CLOSEST_TRIP_FIT_ZOOM = 16;
const KEEP_IN_VIEW_MARGIN_SHARE = 0.1;
const MAP_GESTURES = Object.freeze(['scrollZoom', 'dragPan', 'doubleClickZoom', 'touchZoomRotate', 'keyboard']);
const EMPTY_PICTURE = Object.freeze({ fillForCell: () => null, places: [], radius: null, annotation: null, callout: null, busLinesShown: false, selectedPlaceId: null, start: null, startCellIndex: null, startCellStressed: false, routes: { lines: [], busStops: [], stopsPassed: [] }, busNetwork: [], highNeedOutline: null, lilaTracts: null, straightLine: null });

function overlayColors(definition, scheme) {
  const palette = paletteFor(definition, scheme);
  const look = overlayLook(definition, scheme).colors;
  return { ...look, ramp: palette.ramp, ground: groundColor(definition, scheme), outline: palette.startCellFallback, routeCar: look.car, routeBus: look.bus, routeWalk: look.walk };
}

function ghostColor(definition, scheme) {
  const [red, green, blue, alpha] = parseColor(paletteFor(definition, scheme).ghost);
  return [red / 255, green / 255, blue / 255, alpha * (definition.surface.ghost.visible ? definition.surface.ghost.opacity : 0)];
}

function rangeOrWholeFileSource(url) {
  let wholeFile = null;

  async function sliceOfWholeFile(offset, length) {
    const buffer = await wholeFile;
    return { data: buffer.slice(offset, offset + length) };
  }

  return {
    getKey: () => url,
    async getBytes(offset, length, signal) {
      if (wholeFile) return sliceOfWholeFile(offset, length);
      const response = await fetch(url, { headers: { range: `bytes=${offset}-${offset + length - 1}` }, signal });
      if (!response.ok) throw new Error(`${url} answered ${response.status}`);
      if (response.status === 206) return { data: await response.arrayBuffer() };
      wholeFile ??= response.arrayBuffer().catch((error) => {
        wholeFile = null;
        throw error;
      });
      return sliceOfWholeFile(offset, length);
    },
  };
}

function boundsAround(points) {
  const lons = points.map(([lon]) => lon);
  const lats = points.map(([, lat]) => lat);
  return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
}

function basemapFor(engine, tiles) {
  if (!tiles) return null;
  const protocol = new tiles.Protocol();
  engine.addProtocol('pmtiles', protocol.tile);
  protocol.add(new tiles.PMTiles(rangeOrWholeFileSource(BASEMAP_FILE)));
  return { url: `pmtiles://${BASEMAP_FILE}`, glyphs: BASEMAP_GLYPHS, attribution: BASEMAP_ATTRIBUTION };
}


export function createFoodMap(container, { hexGrid, cells, countyOutline, paintSurface, mapStyle, colorScheme = () => 'light', onPlaceTapped, onEmptyMapTapped = () => {}, onPointTapped = null, animates = false, describePlace, describeCell = () => null, onStartDropped, onTilesUnavailable, onViewChanged, controlsOverMap = () => [] }) {
  const engine = globalThis.maplibregl;
  const { south, west, north, east } = hexGrid.countyBounds();
  const countyBounds = [[west, south], [east, north]];
  const roomWide = (east - west) * ROOM_AROUND_COUNTY_SHARE;
  const roomHigh = (north - south) * ROOM_AROUND_COUNTY_SHARE;
  const basemap = basemapFor(engine, globalThis.pmtiles);
  const centres = hexGrid.cellCentres();
  const hexSurface = paintSurface ? createHexSurface({ layerId: SURFACE_LAYER_ID, cells, centres, cornersOf: hexGrid.cellCorners, animates, requestRepaint: () => map.triggerRepaint() }) : null;
  let definition = mapStyle;
  let scheme = colorScheme();
  let colors = overlayColors(definition, scheme);
  let ghost = ghostColor(definition, scheme);
  const transitionMs = animates ? transitionLengthMs(STEP_TRANSITION) : 0;
  let style = compileMapStyle({ definition, scheme, basemap, transitionMs });
  const map = new engine.Map({
    container,
    style,
    bounds: countyBounds,
    maxBounds: [[west - roomWide, south - roomHigh], [east + roomWide, north + roomHigh]],
    maxZoom: CLOSEST_ZOOM,
    boxZoom: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    renderWorldCopies: false,
    attributionControl: { compact: true },
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.addControl(new engine.NavigationControl({ showCompass: false }), 'top-left');

  function keepCountyAsWidestView() {
    const countyCamera = map.cameraForBounds(countyBounds);
    if (countyCamera) map.setMinZoom(countyCamera.zoom - ZOOM_LEVELS_WIDER_THAN_COUNTY);
  }
  keepCountyAsWidestView();

  let tilesReported = false;
  map.on('error', (event) => {
    if (event.sourceId !== 'basemap' || tilesReported) return;
    tilesReported = true;
    onTilesUnavailable();
  });

  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.className = 'map-overlay';
  container.insertBefore(overlayCanvas, container.querySelector('.maplibregl-control-container'));
  const context = overlayCanvas.getContext('2d');
  let picture = EMPTY_PICTURE;
  let projectedPins = [];
  let isInteractive = true;
  let sizedTo = containerSize();
  const motion = animates ? STEP_TRANSITION : null;
  let presence = { pins: new Map(), circles: new Map(), busRoutes: new Map(), trips: new Map(), annotations: new Map(), callouts: new Map(), straightLines: new Map() };
  let startGlide = null;
  const shownBusShares = new Map();
  let coveredBottomPx = 0;
  let isStyleReady = false;
  let isRestylePending = false;
  let shownBusNetwork = null;
  let shownHighNeedOutline = null;
  let shownLilaTracts = null;
  let areLilaTractsShown = null;
  let shownStartCellKey = null;

  function containerSize() {
    return { x: container.clientWidth, y: container.clientHeight };
  }

  function uncoveredSize() {
    const size = containerSize();
    return { x: size.x, y: Math.max(0, size.y - coveredBottomPx) };
  }

  function toPixels(point) {
    return map.project([point.lon, point.lat]);
  }

  function pixelsPerMile() {
    const center = map.getCenter();
    const centerPx = map.project(center);
    const oneMileNorthPx = map.project([center.lng, center.lat + hexGrid.latitudeDegreesForMiles(1)]);
    return Math.hypot(centerPx.x - oneMileNorthPx.x, centerPx.y - oneMileNorthPx.y);
  }

  function setSourceData(sourceId, data) {
    map.getSource(sourceId)?.setData(data);
  }

  function rippleOrigin() {
    if (picture.start) return picture.start;
    const center = map.getCenter();
    return { lat: center.lat, lon: center.lng };
  }

  function showSurface() {
    if (!hexSurface) return;
    hexSurface.show({
      fills: cells.map((cell) => surfaceFill(definition, cell, picture.fillForCell(cell, colors))),
      look: picture.look ?? picture.step ?? null,
      sizeByHomes: picture.sizeByHomes,
      gapped: picture.gapped,
      rippleOrigin: rippleOrigin(),
    });
  }

  function showHighNeedOutline() {
    if (picture.highNeedOutline === shownHighNeedOutline) return;
    shownHighNeedOutline = picture.highNeedOutline;
    setSourceData('high-need', highNeedFeatures(picture.highNeedOutline));
  }

  function showLilaTracts() {
    if (picture.lilaTracts && picture.lilaTracts !== shownLilaTracts) {
      shownLilaTracts = picture.lilaTracts;
      setSourceData('lila-tracts', lilaTractFeatures(picture.lilaTracts));
    }
    const isShown = Boolean(picture.lilaTracts);
    if (isShown === areLilaTractsShown || !map.getLayer('lila-tracts-fill')) return;
    areLilaTractsShown = isShown;
    map.setPaintProperty('lila-tracts-fill', 'fill-opacity', isShown ? definition.lines.lila.fillOpacity : 0);
    map.setPaintProperty('food-lila-tracts-line', 'line-opacity', isShown ? 1 : 0);
  }

  function showStartCell() {
    const cellIndex = interaction.draggedStart() ? null : picture.startCellIndex;
    const fill = cellIndex !== null && paintSurface ? picture.fillForCell(cells[cellIndex], colors) : null;
    const widthPx = picture.startCellStressed ? definition.lines.startCellPx * STRESSED_START_CELL_SCALE : null;
    const key = `${cellIndex}|${fill}|${colors.outline}|${widthPx}`;
    if (key === shownStartCellKey) return;
    shownStartCellKey = key;
    setSourceData('start-cell', startCellFeatures(cellIndex === null ? null : hexGrid.cellCorners(cellIndex), { fill, fallbackColor: colors.outline, edgeShade: definition.lines.startCellEdgeShade, widthPx }));
  }

  function showPicture() {
    if (!isStyleReady) return;
    showSurface();
    if (picture.busNetwork !== shownBusNetwork) {
      shownBusNetwork = picture.busNetwork;
      setSourceData('bus-network', busNetworkFeatures(picture.busNetwork));
    }
    showHighNeedOutline();
    showLilaTracts();
    showStartCell();
  }

  function forgetShownPicture() {
    shownBusNetwork = null;
    shownBusShares.clear();
    shownHighNeedOutline = null;
    shownLilaTracts = null;
    areLilaTractsShown = null;
    shownStartCellKey = null;
  }

  hexSurface?.readFrameFrom(() => ({
    definition,
    zoom: map.getZoom(),
    cellRadiusPx: hexGrid.cellRadiusMi * pixelsPerMile() * (window.devicePixelRatio || 1),
    hasTrip: picture.routes.lines.length > 0,
    sizeByHomes: picture.sizeByHomes,
    ghost,
  }));

  function addSurfaceLayer() {
    if (hexSurface && !map.getLayer(SURFACE_LAYER_ID)) map.addLayer(hexSurface.layer, layerAboveSurface(style));
  }

  map.on('style.load', () => {
    isStyleReady = true;
    addSurfaceLayer();
    forgetShownPicture();
    setSourceData('county', linesFeatures(countyOutline));
    if (isRestylePending) restyle();
    else showPicture();
  });

  function cameraTiming(durationMs) {
    if (durationMs === null) return {};
    return animates ? { duration: durationMs, easing: easeInOutCubic } : { duration: 0 };
  }

  function requestOverlayDraw() {
    map.triggerRepaint();
  }

  function nearestVertex(parts, origin) {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const part of parts) {
      for (const [lon, lat] of part) {
        const distance = Math.hypot(lat - origin.lat, lon - origin.lon);
        if (distance < nearestDistance) {
          nearest = { lat, lon };
          nearestDistance = distance;
        }
      }
    }
    return nearest ?? origin;
  }

  function tripKey(routes) {
    return routes.lines.map((route) => `${route.trip}:${route.mode}:${route.line[0]}:${route.line.at(-1)}`).join('|');
  }

  function shownMarks(origin) {
    return {
      pins: picture.places.map((place) => ({ key: place.id, lat: place.lat, lon: place.lon, place })),
      circles: picture.radius ? picture.radius.centres.map((centre) => ({ key: `${picture.radius.miles}:${centre.lat}:${centre.lon}`, lat: centre.lat, lon: centre.lon, miles: picture.radius.miles })) : [],
      busRoutes: picture.busLinesShown ? picture.busNetwork.map((route, index) => ({ key: index, ...nearestVertex(route.parts, origin) })) : [],
      annotations: picture.annotation ? [{ key: `${picture.annotation.text}@${picture.annotation.at.lat},${picture.annotation.at.lon}`, lat: picture.annotation.at.lat, lon: picture.annotation.at.lon, text: picture.annotation.text }] : [],
      callouts: picture.callout ? [{ key: `${picture.callout.text}@${picture.callout.at.lat},${picture.callout.at.lon}`, lat: picture.callout.at.lat, lon: picture.callout.at.lon, text: picture.callout.text, avoidLines: picture.callout.avoidLines ?? null }] : [],
      straightLines: picture.straightLine ? [{ key: `${picture.straightLine.from.lat},${picture.straightLine.from.lon}>${picture.straightLine.to.lat},${picture.straightLine.to.lon}`, lat: picture.straightLine.from.lat, lon: picture.straightLine.from.lon, ...picture.straightLine }] : [],
      trips: picture.routes.lines.length > 0 ? [{ key: tripKey(picture.routes), lat: origin.lat, lon: origin.lon, routes: picture.routes }] : [],
    };
  }

  function trackPresence(now) {
    const origin = rippleOrigin();
    const marks = shownMarks(origin);
    presence = Object.fromEntries(Object.entries(presence).map(([group, before]) => [group, presenceAfter(before, marks[group], { now, origin, timing: motion })]));
    startGlide = glideAfter(startGlide, picture.start, { now, timing: motion });
  }

  function showBusShares(shown) {
    if (!isStyleReady || !map.getSource('bus-network')) return;
    const shares = new Map(shown.map(({ mark, share }) => [mark.key, share]));
    for (const key of new Set([...shownBusShares.keys(), ...shares.keys()])) {
      const share = shares.get(key) ?? 0;
      if (shownBusShares.get(key) === share) continue;
      shownBusShares.set(key, share);
      map.setFeatureState({ source: 'bus-network', id: key }, { share });
    }
  }

  function isStartGliding(now) {
    return Boolean(motion && startGlide && now - startGlide.startedAt < transitionLengthMs(motion));
  }

  function projectedTrip(routes) {
    return {
      routes: sideBySideLines(routes.lines.map((route, lineId) => ({
        lineId,
        mode: route.mode,
        trip: route.trip,
        label: route.label,
        isOtherWay: route.isOtherWay,
        points: route.line.map(([lon, lat]) => toPixels({ lat, lon })),
      })), LANES),
      busStops: routes.busStops.map(toPixels),
      stopsPassed: (routes.stopsPassed ?? []).map(toPixels),
    };
  }

  function overlayScene(now, { pins, trips }) {
    const draggedStart = interaction.draggedStart();
    const starts = draggedStart ? [{ point: draggedStart, share: 1 }] : glideMarks(startGlide, now, motion);
    const start = starts.at(-1)?.point ?? null;
    const current = trips.find((trip) => !trip.isLeaving);
    return {
      ...(current ? projectedTrip(current.mark.routes) : { routes: [], busStops: [], stopsPassed: [] }),
      tripShare: current?.share ?? 0,
      leavingTrips: trips.filter((trip) => trip.isLeaving).map((trip) => ({ ...projectedTrip(trip.mark.routes), share: trip.share })),
      pins: pins.map(({ mark, share, isLeaving }) => ({ placeId: mark.place.id, kind: mark.place.kind, selected: mark.place.id === picture.selectedPlaceId, isLeaving, scale: share, ...toPixels(mark.place) })),
      startPx: start ? toPixels(start) : null,
      startsShown: starts.map(({ point, share }) => ({ px: toPixels(point), share })),
    };
  }

  function controlBoxes() {
    const mapBox = container.getBoundingClientRect();
    return [container.querySelector('.maplibregl-ctrl-group'), ...controlsOverMap()]
      .filter((control) => control && !control.hidden && control.offsetParent !== null)
      .map((control) => {
        const box = control.getBoundingClientRect();
        return { left: box.left - mapBox.left, right: box.right - mapBox.left, top: box.top - mapBox.top, bottom: box.bottom - mapBox.top };
      });
  }

  function prepareOverlay() {
    const size = containerSize();
    const pixelRatio = window.devicePixelRatio || 1;
    const widthPx = size.x * pixelRatio;
    const heightPx = size.y * pixelRatio;
    if (overlayCanvas.width !== widthPx || overlayCanvas.height !== heightPx) {
      overlayCanvas.width = widthPx;
      overlayCanvas.height = heightPx;
      overlayCanvas.style.width = `${size.x}px`;
      overlayCanvas.style.height = `${size.y}px`;
    }
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, size.x, size.y);
  }

  const overlayPainter = createOverlayPainter({ context, toPixels, pixelsPerMile, viewSizePx: uncoveredSize, controlBoxes, requestRedraw: requestOverlayDraw });

  function drawOverlay() {
    prepareOverlay();
    const now = performance.now();
    const groups = Object.fromEntries(Object.entries(presence).map(([group, entries]) => [group, presenceNow(entries, now, motion)]));
    presence = Object.fromEntries(Object.entries(groups).map(([group, { kept }]) => [group, kept]));
    showBusShares(groups.busRoutes.shown);
    const scene = overlayScene(now, { pins: groups.pins.shown, trips: groups.trips.shown });
    projectedPins = scene.pins.filter((pin) => !pin.isLeaving);
    overlayPainter.paint({ colors, definition }, {
      routes: picture.routes,
      scene,
      circles: groups.circles.shown,
      annotations: groups.annotations.shown,
      callouts: groups.callouts.shown,
      straightLines: groups.straightLines.shown,
      hoveredCellCorners: interaction.hoveredCellIndex() === null ? null : hexGrid.cellCorners(interaction.hoveredCellIndex()),
    });
    if (Object.values(groups).some((group) => group.isMoving) || isStartGliding(now)) requestAnimationFrame(requestOverlayDraw);
  }

  map.on('render', drawOverlay);
  map.on('resize', keepCountyAsWidestView);
  map.on('moveend', () => onViewChanged());

  const interaction = createMapInteraction(container, {
    map,
    hexGrid,
    isInteractive: () => isInteractive,
    startPoint: () => picture.start,
    shownPins: () => projectedPins,
    toPixels,
    pixelsPerMile,
    describePlace,
    describeCell,
    onPlaceTapped,
    onPointTapped,
    onEmptyMapTapped,
    onStartDropped,
    showStartCell: () => showStartCell(),
    requestOverlayDraw: () => requestOverlayDraw(),
  });

  function restyle() {
    if (!isStyleReady) {
      isRestylePending = true;
      return;
    }
    isRestylePending = false;
    scheme = colorScheme();
    colors = overlayColors(definition, scheme);
    ghost = ghostColor(definition, scheme);
    const nextStyle = compileMapStyle({ definition, scheme, basemap, transitionMs });
    const changes = styleChanges(style, nextStyle);
    style = nextStyle;
    hexSurface?.forgetColors();
    if (changes) {
      for (const change of changes) {
        if (change.kind === 'paint') map.setPaintProperty(change.layerId, change.property, change.value);
        else map.setLayoutProperty(change.layerId, change.property, change.value);
      }
    } else {
      map.setStyle(style, { diff: true });
      addSurfaceLayer();
      forgetShownPicture();
      setSourceData('county', linesFeatures(countyOutline));
    }
    areLilaTractsShown = null;
    showPicture();
    requestOverlayDraw();
  }

  return {
    show(nextPicture) {
      picture = nextPicture;
      trackPresence(performance.now());
      if (nextPicture.mapStyle && nextPicture.mapStyle !== definition) {
        definition = nextPicture.mapStyle;
        restyle();
        return;
      }
      showPicture();
      requestOverlayDraw();
      map?.triggerRepaint();
    },
    refreshColors() {
      restyle();
    },
    setInteractive(nextInteractive) {
      if (nextInteractive === isInteractive) return;
      isInteractive = nextInteractive;
      for (const handler of MAP_GESTURES) map[handler][isInteractive ? 'enable' : 'disable']();
      container.classList.toggle('is-locked', !isInteractive);
    },
    showMapStyle(nextDefinition) {
      definition = nextDefinition;
      restyle();
    },
    cancelStartDrag() {
      return interaction.cancelStartDrag();
    },
    controlsChanged() {
      requestOverlayDraw();
    },
    coverBottom(heightPx) {
      if (heightPx === coveredBottomPx) return;
      coveredBottomPx = heightPx;
      requestOverlayDraw();
    },
    showsWholeTrip(lines) {
      const visible = uncoveredSize();
      return lines.every((route) => route.line.every(([lon, lat]) => {
        const pointPx = toPixels({ lat, lon });
        return pointPx.x >= 0 && pointPx.y >= 0 && pointPx.x <= visible.x && pointPx.y <= visible.y;
      }));
    },
    fitCounty({ durationMs = null } = {}) {
      map.fitBounds(countyBounds, { padding: { top: 0, left: 0, right: 0, bottom: coveredBottomPx }, ...cameraTiming(durationMs) });
    },
    fitTrip(lines, { zoomOut = 0, durationMs = null } = {}) {
      const points = lines.flatMap((route) => route.line);
      if (points.length === 0) return;
      const padding = TRIP_FIT_PADDING_PX;
      const options = { padding: { top: padding, left: padding, right: padding, bottom: padding + coveredBottomPx }, maxZoom: CLOSEST_TRIP_FIT_ZOOM };
      const camera = zoomOut > 0 ? map.cameraForBounds(boundsAround(points), options) : null;
      if (camera) map.easeTo({ center: camera.center, zoom: camera.zoom - zoomOut, bearing: 0, ...cameraTiming(durationMs) });
      else map.fitBounds(boundsAround(points), { ...options, ...cameraTiming(durationMs) });
    },
    keepInView(point) {
      const pointPx = toPixels(point);
      const size = uncoveredSize();
      const marginX = size.x * KEEP_IN_VIEW_MARGIN_SHARE;
      const marginY = size.y * KEEP_IN_VIEW_MARGIN_SHARE;
      const isWellInside = pointPx.x >= marginX && pointPx.x <= size.x - marginX && pointPx.y >= marginY && pointPx.y <= size.y - marginY;
      if (!isWellInside) map.panTo([point.lon, point.lat], { offset: [0, -coveredBottomPx / 2] });
    },
    resize() {
      const size = containerSize();
      if (size.x !== sizedTo.x || size.y !== sizedTo.y) {
        sizedTo = size;
        map.resize();
        keepCountyAsWidestView();
      }
      requestOverlayDraw();
    },
  };
}
