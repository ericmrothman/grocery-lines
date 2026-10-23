import { startPinHeadCentre, START_PIN_HEAD_RADIUS_PX } from './gestures.js';
import { placeRouteLabels, labelSpot, routeLabelKey, placeCallout } from './route_labels.js';
import { contrastRatio } from './color.js';
import { ICON_GRID_UNITS, ROUTE_ICON_PATHS, ROUTE_CHIP } from './route_icons.js';

const ROUTE_LABEL_FONT = `700 ${ROUTE_CHIP.fontPx}px system-ui, sans-serif`;
const SHORTEST_LABELLED_LINE_PX = 64;
const ROUTE_LABEL_SHADOW = Object.freeze({ color: 'rgba(15, 23, 42, 0.28)', blurPx: 4, dropPx: 1 });
const ROUTE_LABEL_GLIDE_MS = 220;
const BUS_STOP_RADIUS_PX = 6;
const BUS_STOP_RING_PX = 3;
const STOP_PASSED_RADIUS_PX = 3.5;
const HOVERED_CELL = Object.freeze({ color: '#ffffff', linePx: 2, casingPx: 4 });
const STOP_PASSED_RING_PX = 2;
const CALLOUT = Object.freeze({ font: '600 13px system-ui, sans-serif', heightPx: 28, padPx: 12, arrowPx: 2, arrowHeadPx: 8, clearOfPinPx: 6 });
const START_RING_PX = 2;
const START_TAG = Object.freeze({ widthPx: 56, heightPx: 24, gapPx: 4 });
const RADIUS_FILL_ALPHA = 0.12;
const RADIUS_EDGE_ALPHA = 0.9;
const RADIUS_EDGE_PX = 1.5;
const STRAIGHT_LINE = Object.freeze({ widthPx: 3, dash: [1, 7] });
const ANNOTATION = Object.freeze({ font: '600 13px system-ui, sans-serif', heightPx: 28, padPx: 10, risePx: 36, dotPx: 4 });

let routeIconShapes = null;

function routeIconShape(legMode) {
  routeIconShapes ??= Object.fromEntries(Object.entries(ROUTE_ICON_PATHS).map(([mode, path]) => [mode, new Path2D(path)]));
  return routeIconShapes[legMode];
}

export function createOverlayPainter({ context, toPixels, pixelsPerMile, viewSizePx, controlBoxes, requestRedraw }) {
  let colors = null;
  let definition = null;
  let shownRoutes = { lines: [] };
  let routeLabelMemory = { routes: null, choices: new Map(), glides: new Map() };

  function routeWidthPx(mode) {
    return definition.routes[`${mode}Px`];
  }

  function routeColor(trip) {
    return { walk: colors.routeWalk, bus: colors.routeBus, car: colors.routeCar, straight: colors.pinByKind.supermarket }[trip];
  }

  function routeDash(mode) {
    return mode === 'walk' ? definition.routes.walkDash : [];
  }

  function straightLinePx(mark) {
    return [toPixels(mark.from), toPixels(mark.to)];
  }

  function straightLineLabel(mark) {
    const [fromPx, toPx] = straightLinePx(mark);
    const widthPx = labelWidthPx(mark.label);
    const x = (fromPx.x + toPx.x) / 2;
    const y = (fromPx.y + toPx.y) / 2;
    return { text: mark.label, mode: 'straight', legMode: 'straight', widthPx, heightPx: ROUTE_CHIP.heightPx, box: { left: x - widthPx / 2, right: x + widthPx / 2, top: y - ROUTE_CHIP.heightPx / 2, bottom: y + ROUTE_CHIP.heightPx / 2 } };
  }

  function straightLineMarks(straightLines) {
    return straightLines.flatMap(({ mark }) => [
      { shape: 'line', points: straightLinePx(mark), halfWidthPx: STRAIGHT_LINE.widthPx / 2, importance: 'hard' },
      { shape: 'box', box: straightLineLabel(mark).box, importance: 'hard' },
    ]);
  }

  function drawStraightLines(straightLines) {
    for (const { mark, share } of straightLines) {
      const [fromPx, toPx] = straightLinePx(mark);
      context.save();
      context.globalAlpha = share;
      context.beginPath();
      context.moveTo(fromPx.x, fromPx.y);
      context.lineTo(toPx.x, toPx.y);
      context.lineCap = 'round';
      context.setLineDash([]);
      context.lineWidth = STRAIGHT_LINE.widthPx + definition.routes.casingPx * 2;
      context.strokeStyle = colors.pinEdge;
      context.stroke();
      context.setLineDash(STRAIGHT_LINE.dash);
      context.lineWidth = STRAIGHT_LINE.widthPx;
      context.strokeStyle = routeColor('straight');
      context.stroke();
      context.setLineDash([]);
      context.restore();
    }
  }

  function drawStraightLineLabels(straightLines) {
    for (const { mark, share } of straightLines) {
      context.save();
      context.globalAlpha = share;
      drawFilledLabel(straightLineLabel(mark));
      context.restore();
    }
  }

  function startTagBox(startPx) {
    const head = startPinHeadCentre(startPx);
    const left = head.x + START_PIN_HEAD_RADIUS_PX + START_TAG.gapPx;
    const top = head.y - START_TAG.heightPx / 2;
    return { left, right: left + START_TAG.widthPx, top, bottom: top + START_TAG.heightPx };
  }

  function pinSizePx(pin) {
    return pin.selected ? definition.pins.selectedSizePx : definition.pins.sizePx;
  }

  function marksThatLabelsAvoid(scene) {
    const marks = [];
    for (const route of scene.routes) marks.push({ shape: 'line', isRoute: true, lineId: route.lineId, points: route.points, halfWidthPx: routeWidthPx(route.mode) / 2, importance: 'hard' });
    for (const stop of scene.busStops) marks.push({ shape: 'circle', centre: stop, radiusPx: BUS_STOP_RADIUS_PX + BUS_STOP_RING_PX / 2, importance: 'hard' });
    for (const stop of scene.stopsPassed) marks.push({ shape: 'circle', centre: stop, radiusPx: STOP_PASSED_RADIUS_PX + STOP_PASSED_RING_PX / 2, importance: 'hard' });
    for (const box of scene.calloutBoxes ?? []) marks.push({ shape: 'box', box, importance: 'hard' });
    for (const pin of scene.pins) marks.push({ shape: 'circle', centre: pin, radiusPx: pinSizePx(pin) + 1, importance: pin.selected ? 'hard' : 'soft' });
    if (scene.startPx) {
      marks.push({ shape: 'circle', centre: startPinHeadCentre(scene.startPx), radiusPx: START_PIN_HEAD_RADIUS_PX + START_RING_PX, importance: 'hard' });
      marks.push({ shape: 'line', points: [scene.startPx, startPinHeadCentre(scene.startPx)], halfWidthPx: START_PIN_HEAD_RADIUS_PX / 2, importance: 'hard' });
      marks.push({ shape: 'box', box: startTagBox(scene.startPx), importance: 'hard' });
    }
    for (const box of controlBoxes()) marks.push({ shape: 'box', box, importance: 'hard' });
    marks.push(...straightLineMarks(scene.straightLines ?? []));
    return marks;
  }

  function traceRoute(route) {
    context.beginPath();
    route.points.forEach((pointPx, index) => {
      if (index === 0) context.moveTo(pointPx.x, pointPx.y);
      else context.lineTo(pointPx.x, pointPx.y);
    });
  }

  function drawCasing(route, share) {
    traceRoute(route);
    context.setLineDash([]);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = routeWidthPx(route.mode) + definition.routes.casingPx * 2;
    context.strokeStyle = colors.pinEdge;
    context.globalAlpha = (route.isOtherWay ? definition.routes.otherWayOpacity : 1) * share;
    context.stroke();
  }

  function drawRoutes(scene, share) {
    for (const route of scene.routes) drawCasing(route, share);
    for (const route of scene.routes) {
      traceRoute(route);
      context.setLineDash(routeDash(route.mode));
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.lineWidth = routeWidthPx(route.mode);
      context.strokeStyle = routeColor(route.trip);
      context.globalAlpha = (route.isOtherWay ? definition.routes.otherWayOpacity : 1) * share;
      context.stroke();
    }
    context.globalAlpha = share;
    context.setLineDash([]);
    for (const stopPx of scene.stopsPassed) drawStop(stopPx, STOP_PASSED_RADIUS_PX, STOP_PASSED_RING_PX);
    for (const stopPx of scene.busStops) {
      context.beginPath();
      context.arc(stopPx.x, stopPx.y, BUS_STOP_RADIUS_PX, 0, Math.PI * 2);
      context.fillStyle = colors.pinEdge;
      context.fill();
      context.lineWidth = BUS_STOP_RING_PX;
      context.strokeStyle = colors.routeBus;
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  function drawStop(stopPx, radiusPx, ringPx) {
    context.beginPath();
    context.arc(stopPx.x, stopPx.y, radiusPx, 0, Math.PI * 2);
    context.fillStyle = colors.pinEdge;
    context.fill();
    context.lineWidth = ringPx;
    context.strokeStyle = colors.routeBus;
    context.stroke();
  }

  function drawPin(pin) {
    const kind = pin.kind;
    const size = pinSizePx(pin) * pin.scale;
    if (size <= 0) return;
    context.beginPath();
    if (kind === 'supermarket') context.rect(pin.x - size, pin.y - size, size * 2, size * 2);
    else if (kind === 'pantry') context.arc(pin.x, pin.y, size, 0, Math.PI * 2);
    else {
      context.moveTo(pin.x, pin.y - size);
      context.lineTo(pin.x + size, pin.y);
      context.lineTo(pin.x, pin.y + size);
      context.lineTo(pin.x - size, pin.y);
      context.closePath();
    }
    context.fillStyle = pin.selected ? colors.selected : colors.pinByKind[kind];
    context.fill();
    context.lineWidth = 1.5;
    context.strokeStyle = colors.pinEdge;
    context.stroke();
  }

  function labelWidthPx(words) {
    if (!words) return ROUTE_CHIP.heightPx;
    context.font = ROUTE_LABEL_FONT;
    return ROUTE_CHIP.paddingPx + ROUTE_CHIP.iconPx + ROUTE_CHIP.textGapPx + context.measureText(words).width + ROUTE_CHIP.paddingPx * 2;
  }

  function onScreenLengthPx(points) {
    let lengthPx = 0;
    for (let index = 1; index < points.length; index++) lengthPx += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
    return lengthPx;
  }

  function routeLabelRequests(scene) {
    return scene.routes
      .filter((route) => typeof route.label === 'string' && onScreenLengthPx(route.points) >= SHORTEST_LABELLED_LINE_PX)
      .map((route) => ({
        text: route.label,
        mode: route.trip,
        legMode: route.mode,
        lineId: route.lineId,
        linePx: route.points,
        widthPx: labelWidthPx(route.label),
        heightPx: ROUTE_CHIP.heightPx,
      }));
  }

  function fillTextCenterdOnLine(text, x, centerY) {
    context.textBaseline = 'alphabetic';
    const measured = context.measureText(text);
    context.fillText(text, x, centerY + (measured.actualBoundingBoxAscent - measured.actualBoundingBoxDescent) / 2);
  }

  function drawRouteIcon(legMode, centerX, centerY) {
    const scale = ROUTE_CHIP.iconPx / ICON_GRID_UNITS;
    context.save();
    context.translate(centerX - ROUTE_CHIP.iconPx / 2, centerY - ROUTE_CHIP.iconPx / 2);
    context.scale(scale, scale);
    context.fillStyle = colors.pinEdge;
    context.fill(routeIconShape(legMode));
    context.restore();
  }

  function drawFilledLabel(label) {
    const words = label.text;
    context.save();
    context.shadowColor = ROUTE_LABEL_SHADOW.color;
    context.shadowBlur = ROUTE_LABEL_SHADOW.blurPx;
    context.shadowOffsetY = ROUTE_LABEL_SHADOW.dropPx;
    context.beginPath();
    context.roundRect(label.box.left, label.box.top, label.widthPx, label.heightPx, label.heightPx / 2);
    context.fillStyle = colors.pinEdge;
    context.fill();
    context.restore();
    context.beginPath();
    context.roundRect(label.box.left + ROUTE_CHIP.edgePx, label.box.top + ROUTE_CHIP.edgePx, label.widthPx - ROUTE_CHIP.edgePx * 2, label.heightPx - ROUTE_CHIP.edgePx * 2, label.heightPx / 2 - ROUTE_CHIP.edgePx);
    context.fillStyle = routeColor(label.mode);
    context.fill();
    const centerY = label.box.top + label.heightPx / 2;
    const iconCenterX = words ? label.box.left + ROUTE_CHIP.paddingPx + ROUTE_CHIP.iconPx / 2 + 1 : label.box.left + label.widthPx / 2;
    drawRouteIcon(label.legMode, iconCenterX, centerY);
    if (!words) return;
    context.font = ROUTE_LABEL_FONT;
    context.textAlign = 'left';
    context.fillStyle = colors.pinEdge;
    fillTextCenterdOnLine(words, iconCenterX + ROUTE_CHIP.iconPx / 2 + ROUTE_CHIP.textGapPx, centerY);
  }

  function rememberedLabelChoices() {
    if (routeLabelMemory.routes !== shownRoutes && shownRoutes.lines.length > 0) routeLabelMemory = { routes: shownRoutes, choices: new Map(), glides: new Map() };
    return routeLabelMemory.choices;
  }

  function glideShare(elapsedMs) {
    const share = Math.min(1, elapsedMs / ROUTE_LABEL_GLIDE_MS);
    return 1 - (1 - share) ** 3;
  }

  function between(from, to, share) {
    return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
  }

  function glidingLabel(label, request, glide, share) {
    const from = labelSpot(request, glide.fromChoice);
    const center = between(from.centre, { x: label.x, y: label.y }, share);
    const box = { left: center.x - label.widthPx / 2, right: center.x + label.widthPx / 2, top: center.y - label.heightPx / 2, bottom: center.y + label.heightPx / 2 };
    return { ...label, x: center.x, y: center.y, box, leader: { from: between(from.anchor, label.leader.from, share), to: between(from.leaderEnd, label.leader.to, share) } };
  }

  function drawRouteLabels(scene) {
    const requests = routeLabelRequests(scene);
    const requestsByKey = new Map(requests.map((request) => [routeLabelKey(request), request]));
    const choices = rememberedLabelChoices();
    const labels = placeRouteLabels(requests, { viewSizePx: viewSizePx(), marks: marksThatLabelsAvoid(scene), previousChoices: choices });
    const now = performance.now();
    let isStillGliding = false;
    for (const placed of labels) {
      choices.set(placed.key, placed.choice);
      if (placed.movedFrom) routeLabelMemory.glides.set(placed.key, { fromChoice: placed.movedFrom, startedAt: now });
      const glide = routeLabelMemory.glides.get(placed.key);
      const share = glide ? glideShare(now - glide.startedAt) : 1;
      if (glide && share >= 1) routeLabelMemory.glides.delete(placed.key);
      const label = share < 1 ? glidingLabel(placed, requestsByKey.get(placed.key), glide, share) : placed;
      isStillGliding = isStillGliding || share < 1;
      context.beginPath();
      context.moveTo(label.leader.from.x, label.leader.from.y);
      context.lineTo(label.leader.to.x, label.leader.to.y);
      context.lineWidth = 2;
      context.strokeStyle = routeColor(label.mode);
      context.stroke();
      drawFilledLabel(label);
    }
    if (isStillGliding) requestRedraw();
  }

  function traceStartPin(startPx) {
    const head = startPinHeadCentre(startPx);
    const tangentAngleFromTip = Math.acos(START_PIN_HEAD_RADIUS_PX / (startPx.y - head.y));
    context.beginPath();
    context.moveTo(startPx.x, startPx.y);
    context.arc(head.x, head.y, START_PIN_HEAD_RADIUS_PX, Math.PI / 2 + tangentAngleFromTip, Math.PI / 2 - tangentAngleFromTip);
    context.closePath();
  }

  function drawStart(startPx) {
    traceStartPin(startPx);
    context.fillStyle = colors.start;
    context.fill();
    context.lineWidth = START_RING_PX;
    context.strokeStyle = colors.pinEdge;
    context.stroke();
    const head = startPinHeadCentre(startPx);
    context.beginPath();
    context.arc(head.x, head.y, START_PIN_HEAD_RADIUS_PX / 2.5, 0, Math.PI * 2);
    context.fillStyle = colors.pinEdge;
    context.fill();
    const tag = startTagBox(startPx);
    context.beginPath();
    context.roundRect(tag.left, tag.top, START_TAG.widthPx, START_TAG.heightPx, START_TAG.heightPx / 2);
    context.fillStyle = colors.start;
    context.fill();
    context.fillStyle = colors.startInk;
    context.font = '700 12px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('START', tag.left + START_TAG.widthPx / 2, tag.top + START_TAG.heightPx / 2 + 0.5);
  }

  function drawCircles(circles) {
    if (circles.length === 0) return;
    const milePx = pixelsPerMile();
    const path = new Path2D();
    for (const { mark, share } of circles) {
      const centrePx = toPixels(mark);
      const radiusPx = mark.miles * milePx * share;
      path.moveTo(centrePx.x + radiusPx, centrePx.y);
      path.arc(centrePx.x, centrePx.y, radiusPx, 0, Math.PI * 2);
    }
    context.save();
    context.fillStyle = colors.pinByKind.supermarket;
    context.strokeStyle = colors.pinByKind.supermarket;
    context.globalAlpha = RADIUS_FILL_ALPHA;
    context.fill(path, 'nonzero');
    context.globalAlpha = RADIUS_EDGE_ALPHA;
    context.lineWidth = RADIUS_EDGE_PX;
    context.stroke(path);
    context.restore();
  }

  function annotationColors() {
    const ink = contrastRatio(colors.pinEdge, '#ffffff') >= 4.5 ? '#ffffff' : colors.pinEdge;
    return { ink, paper: ink === '#ffffff' ? colors.pinEdge : '#ffffff' };
  }

  function calloutAvoids(mark, scene) {
    if (!mark.avoidLines) return marksThatLabelsAvoid(scene);
    const fixedLines = mark.avoidLines.map((line) => ({ shape: 'line', points: line.map(([lon, lat]) => toPixels({ lat, lon })), halfWidthPx: STRAIGHT_LINE.widthPx, importance: 'hard' }));
    return [...marksThatLabelsAvoid({ ...scene, routes: [], busStops: [], stopsPassed: [], straightLines: [] }), ...fixedLines];
  }

  function placedCallouts(shown, scene) {
    return shown.map(({ mark, share }) => {
      const marks = calloutAvoids(mark, scene);
      context.font = CALLOUT.font;
      const pointPx = toPixels(mark);
      const placed = placeCallout({ pointPx, widthPx: context.measureText(mark.text).width + CALLOUT.padPx * 2, heightPx: CALLOUT.heightPx }, { viewSizePx: viewSizePx(), marks });
      return placed && { ...placed, pointPx, text: mark.text, share };
    }).filter(Boolean);
  }

  function drawCallout({ box, tail, pointPx, text, share }) {
    const { ink, paper } = annotationColors();
    const reach = Math.hypot(pointPx.x - tail.x, pointPx.y - tail.y);
    const along = { x: (pointPx.x - tail.x) / reach, y: (pointPx.y - tail.y) / reach };
    const tip = { x: pointPx.x - along.x * (definition.pins.selectedSizePx + CALLOUT.clearOfPinPx), y: pointPx.y - along.y * (definition.pins.selectedSizePx + CALLOUT.clearOfPinPx) };
    const base = { x: tip.x - along.x * CALLOUT.arrowHeadPx, y: tip.y - along.y * CALLOUT.arrowHeadPx };
    const side = { x: -along.y * CALLOUT.arrowHeadPx / 2, y: along.x * CALLOUT.arrowHeadPx / 2 };
    context.save();
    context.globalAlpha = share;
    context.beginPath();
    context.moveTo(tail.x, tail.y);
    context.lineTo(base.x, base.y);
    context.lineWidth = CALLOUT.arrowPx;
    context.strokeStyle = paper;
    context.stroke();
    context.beginPath();
    context.moveTo(tip.x, tip.y);
    context.lineTo(base.x + side.x, base.y + side.y);
    context.lineTo(base.x - side.x, base.y - side.y);
    context.closePath();
    context.fillStyle = paper;
    context.fill();
    context.beginPath();
    context.roundRect(box.left, box.top, box.right - box.left, box.bottom - box.top, CALLOUT.heightPx / 2);
    context.fill();
    context.font = CALLOUT.font;
    context.fillStyle = ink;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, (box.left + box.right) / 2, (box.top + box.bottom) / 2 + 0.5);
    context.restore();
  }

  function drawAnnotation({ mark, share }) {
    const pointPx = toPixels(mark);
    const { ink, paper } = annotationColors();
    context.save();
    context.globalAlpha = share;
    context.font = ANNOTATION.font;
    const widthPx = context.measureText(mark.text).width + ANNOTATION.padPx * 2;
    const top = pointPx.y - ANNOTATION.risePx - ANNOTATION.heightPx;
    const left = pointPx.x - widthPx / 2;
    context.beginPath();
    context.moveTo(pointPx.x, pointPx.y);
    context.lineTo(pointPx.x, top + ANNOTATION.heightPx);
    context.lineWidth = 1.5;
    context.strokeStyle = paper;
    context.stroke();
    context.beginPath();
    context.arc(pointPx.x, pointPx.y, ANNOTATION.dotPx, 0, Math.PI * 2);
    context.fillStyle = paper;
    context.fill();
    context.beginPath();
    context.roundRect(left, top, widthPx, ANNOTATION.heightPx, 6);
    context.fillStyle = paper;
    context.fill();
    context.fillStyle = ink;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(mark.text, pointPx.x, top + ANNOTATION.heightPx / 2 + 0.5);
    context.restore();
  }

  function drawHoveredCell(cellCorners) {
    if (!cellCorners) return;
    const corners = cellCorners.map(([lon, lat]) => toPixels({ lat, lon }));
    context.save();
    context.beginPath();
    corners.forEach((cornerPx, index) => (index === 0 ? context.moveTo(cornerPx.x, cornerPx.y) : context.lineTo(cornerPx.x, cornerPx.y)));
    context.closePath();
    context.lineJoin = 'round';
    context.lineWidth = HOVERED_CELL.casingPx;
    context.strokeStyle = colors.pinEdge;
    context.stroke();
    context.lineWidth = HOVERED_CELL.linePx;
    context.strokeStyle = HOVERED_CELL.color;
    context.stroke();
    context.restore();
  }

  return {
    paint(look, { routes, scene: tripScene, circles, annotations, callouts: calloutMarks, straightLines = [], hoveredCellCorners }) {
      const scene = { ...tripScene, straightLines };
      colors = look.colors;
      definition = look.definition;
      shownRoutes = routes;
      drawCircles(circles);
      drawHoveredCell(hoveredCellCorners);
      drawStraightLines(straightLines);
      for (const leaving of scene.leavingTrips) drawRoutes(leaving, leaving.share);
      drawRoutes(scene, scene.tripShare);
      for (const pin of scene.pins) drawPin(pin);
      for (const shownStart of scene.startsShown) {
        context.globalAlpha = shownStart.share;
        drawStart(shownStart.px);
      }
      context.globalAlpha = 1;
      for (const annotation of annotations) drawAnnotation(annotation);
      const callouts = placedCallouts(calloutMarks, scene);
      for (const callout of callouts) drawCallout(callout);
      if (scene.tripShare === 0) {
        for (const leaving of scene.leavingTrips) {
          context.globalAlpha = leaving.share;
          drawRouteLabels({ ...leaving, pins: scene.pins, calloutBoxes: [] });
        }
      }
      context.globalAlpha = scene.tripShare;
      drawRouteLabels({ ...scene, calloutBoxes: callouts.map((callout) => callout.box) });
      context.globalAlpha = 1;
      drawStraightLineLabels(straightLines);
    },
  };
}
