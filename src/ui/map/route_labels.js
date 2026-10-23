const SHARES_ALONG_LINE = Object.freeze([0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9]);
const GAPS_FROM_LINE_PX = Object.freeze([10, 20, 32]);
const BREATHING_ROOM_PX = 3;
const LABEL_ORDER_BY_MODE = Object.freeze({ bus: 0, car: 1, walk: 2 });
const COST_OF_COVERING_A_SOFT_MARK = 1000;
const COST_PER_GAP_STEP = 10;
const COST_OF_A_SHARED_STRETCH = 100;
const SHARED_STRETCH_PX = 12;

function segmentLengths(linePx) {
  const lengths = [];
  for (let index = 1; index < linePx.length; index++) {
    lengths.push(Math.hypot(linePx[index].x - linePx[index - 1].x, linePx[index].y - linePx[index - 1].y));
  }
  return lengths;
}

function directionAt(linePx, segmentIndex) {
  const segmentStart = linePx[segmentIndex];
  const segmentEnd = linePx[Math.min(segmentIndex + 1, linePx.length - 1)];
  const length = Math.hypot(segmentEnd.x - segmentStart.x, segmentEnd.y - segmentStart.y);
  return length === 0 ? { x: 1, y: 0 } : { x: (segmentEnd.x - segmentStart.x) / length, y: (segmentEnd.y - segmentStart.y) / length };
}

export function pointAlongLine(linePx, shareOfLength) {
  if (linePx.length === 1) return { x: linePx[0].x, y: linePx[0].y, direction: { x: 1, y: 0 } };
  const lengths = segmentLengths(linePx);
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  let remaining = totalLength * shareOfLength;
  for (let index = 0; index < lengths.length; index++) {
    const isLastSegment = index === lengths.length - 1;
    if (remaining <= lengths[index] || isLastSegment) {
      const shareOfSegment = lengths[index] === 0 ? 0 : Math.min(1, remaining / lengths[index]);
      const segmentStart = linePx[index];
      const segmentEnd = linePx[index + 1];
      return {
        x: segmentStart.x + (segmentEnd.x - segmentStart.x) * shareOfSegment,
        y: segmentStart.y + (segmentEnd.y - segmentStart.y) * shareOfSegment,
        direction: directionAt(linePx, index),
      };
    }
    remaining -= lengths[index];
  }
  return { ...linePx[linePx.length - 1], direction: directionAt(linePx, linePx.length - 2) };
}

function grownBox(box, growthPx) {
  return { left: box.left - growthPx, top: box.top - growthPx, right: box.right + growthPx, bottom: box.bottom + growthPx };
}

function boxesOverlap(first, second) {
  return first.left < second.right && second.left < first.right && first.top < second.bottom && second.top < first.bottom;
}

function pointInBox(point, box) {
  return point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom;
}

function segmentsCross(firstStart, firstEnd, secondStart, secondEnd) {
  const turn = (origin, towards, point) => (towards.x - origin.x) * (point.y - origin.y) - (towards.y - origin.y) * (point.x - origin.x);
  const firstSides = turn(firstStart, firstEnd, secondStart) * turn(firstStart, firstEnd, secondEnd);
  const secondSides = turn(secondStart, secondEnd, firstStart) * turn(secondStart, secondEnd, firstEnd);
  return firstSides <= 0 && secondSides <= 0;
}

function segmentTouchesBox(segmentStart, segmentEnd, box) {
  if (pointInBox(segmentStart, box) || pointInBox(segmentEnd, box)) return true;
  const corners = [
    { x: box.left, y: box.top }, { x: box.right, y: box.top },
    { x: box.right, y: box.bottom }, { x: box.left, y: box.bottom },
  ];
  return corners.some((corner, index) => segmentsCross(segmentStart, segmentEnd, corner, corners[(index + 1) % corners.length]));
}

function boundingBoxOfPoints(points) {
  return {
    left: Math.min(...points.map((point) => point.x)),
    right: Math.max(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    bottom: Math.max(...points.map((point) => point.y)),
  };
}

function lineTouchesBox(points, box) {
  for (let index = 1; index < points.length; index++) {
    if (segmentTouchesBox(points[index - 1], points[index], box)) return true;
  }
  return points.length === 1 && pointInBox(points[0], box);
}

function markTouchesBox(mark, box) {
  if (mark.shape === 'box') return boxesOverlap(grownBox(mark.box, BREATHING_ROOM_PX), box);
  if (mark.shape === 'circle') {
    const nearestX = Math.max(box.left, Math.min(mark.centre.x, box.right));
    const nearestY = Math.max(box.top, Math.min(mark.centre.y, box.bottom));
    return Math.hypot(mark.centre.x - nearestX, mark.centre.y - nearestY) < mark.radiusPx + BREATHING_ROOM_PX;
  }
  const reach = mark.halfWidthPx + BREATHING_ROOM_PX;
  if (!boxesOverlap(grownBox(mark.extent, reach), box)) return false;
  return lineTouchesBox(mark.points, grownBox(box, reach));
}

function markCrossesLeader(mark, leaderStart, leaderEnd) {
  if (mark.shape !== 'line') return markTouchesBox(mark, boundingBoxOfPoints([leaderStart, leaderEnd]));
  for (let index = 1; index < mark.points.length; index++) {
    if (segmentsCross(leaderStart, leaderEnd, mark.points[index - 1], mark.points[index])) return true;
  }
  return false;
}

function prepared(mark) {
  return mark.shape === 'line' ? { ...mark, extent: boundingBoxOfPoints(mark.points) } : mark;
}

function insideView(box, viewSizePx) {
  return box.left >= 0 && box.top >= 0 && box.right <= viewSizePx.x && box.bottom <= viewSizePx.y;
}

export function labelSpot(request, choice) {
  const anchor = pointAlongLine(request.linePx, choice.shareOfLength);
  const sideSign = choice.side === 'left' ? 1 : -1;
  const normal = { x: -anchor.direction.y * sideSign, y: anchor.direction.x * sideSign };
  const gapPx = GAPS_FROM_LINE_PX[choice.gapRank];
  const halfExtentAlongNormal = (Math.abs(normal.x) * request.widthPx + Math.abs(normal.y) * request.heightPx) / 2;
  const reach = gapPx + halfExtentAlongNormal;
  const centre = { x: anchor.x + normal.x * reach, y: anchor.y + normal.y * reach };
  const box = { left: centre.x - request.widthPx / 2, right: centre.x + request.widthPx / 2, top: centre.y - request.heightPx / 2, bottom: centre.y + request.heightPx / 2 };
  const leaderEnd = { x: anchor.x + normal.x * gapPx, y: anchor.y + normal.y * gapPx };
  return { choice, centre, box, anchor: { x: anchor.x, y: anchor.y }, leaderEnd };
}

const VISIBILITY_SAMPLES = 60;

function visibleStretchShares(linePx, viewSizePx) {
  if (linePx.length < 2) return [];
  const isVisible = (point) => point.x >= 0 && point.y >= 0 && point.x <= viewSizePx.x && point.y <= viewSizePx.y;
  let longest = null;
  let runStart = null;
  for (let sample = 0; sample <= VISIBILITY_SAMPLES; sample++) {
    const share = sample / VISIBILITY_SAMPLES;
    if (isVisible(pointAlongLine(linePx, share))) {
      if (runStart === null) runStart = share;
      if (!longest || share - runStart > longest.end - longest.start) longest = { start: runStart, end: share };
    } else {
      runStart = null;
    }
  }
  if (!longest || longest.end === longest.start) return [];
  const span = longest.end - longest.start;
  return [0.5, 0.25, 0.75].map((shareOfRun) => longest.start + span * shareOfRun);
}

function candidateSpots(request, viewSizePx) {
  const spots = [];
  [...SHARES_ALONG_LINE, ...visibleStretchShares(request.linePx, viewSizePx)].forEach((shareOfLength, rankAlongLine) => {
    for (const side of ['left', 'right']) {
      GAPS_FROM_LINE_PX.forEach((gapPx, gapRank) => {
        const spot = labelSpot(request, { shareOfLength, side, gapRank });
        spots.push({ ...spot, baseCost: gapRank * COST_PER_GAP_STEP + rankAlongLine });
      });
    }
  });
  return spots;
}

function distanceToSegment(point, segmentStart, segmentEnd) {
  const along = { x: segmentEnd.x - segmentStart.x, y: segmentEnd.y - segmentStart.y };
  const lengthSquared = along.x * along.x + along.y * along.y;
  const share = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - segmentStart.x) * along.x + (point.y - segmentStart.y) * along.y) / lengthSquared));
  return Math.hypot(point.x - (segmentStart.x + along.x * share), point.y - (segmentStart.y + along.y * share));
}

function lineRunsNear(mark, point, distancePx) {
  if (!pointInBox(point, grownBox(mark.extent, distancePx))) return false;
  if (mark.points.length === 1) return Math.hypot(point.x - mark.points[0].x, point.y - mark.points[0].y) < distancePx;
  for (let index = 1; index < mark.points.length; index++) {
    if (distanceToSegment(point, mark.points[index - 1], mark.points[index]) < distancePx) return true;
  }
  return false;
}

function isAnotherRoute(mark, request) {
  return mark.shape === 'line' && mark.isRoute === true && mark.lineId !== request.lineId;
}

function spotCost(spot, request, marks, viewSizePx) {
  if (!insideView(spot.box, viewSizePx)) return null;
  let softMarksCovered = 0;
  for (const mark of marks) {
    const isOwnLine = mark.lineId !== undefined && mark.lineId === request.lineId;
    if (markTouchesBox(mark, spot.box)) {
      if (mark.importance === 'hard') return null;
      softMarksCovered += 1;
    }
    if (mark.importance === 'hard' && !isOwnLine && markCrossesLeader(mark, spot.anchor, spot.leaderEnd)) return null;
  }
  const sharedStretchCost = marks.some((mark) => isAnotherRoute(mark, request) && lineRunsNear(mark, spot.anchor, SHARED_STRETCH_PX)) ? COST_OF_A_SHARED_STRETCH : 0;
  return spot.baseCost + sharedStretchCost + softMarksCovered * COST_OF_COVERING_A_SOFT_MARK;
}

export function routeLabelKey(request) {
  return `${request.lineId}|${request.text}`;
}

function bestSpot(request, marks, viewSizePx) {
  let best = null;
  for (const spot of candidateSpots(request, viewSizePx)) {
    const cost = spotCost(spot, request, marks, viewSizePx);
    if (cost !== null && (!best || cost < best.cost)) best = { spot, cost };
  }
  return best?.spot ?? null;
}

function keptSpot(request, previousChoice, marks, viewSizePx) {
  if (!previousChoice) return null;
  const spot = labelSpot(request, previousChoice);
  return spotCost(spot, request, marks, viewSizePx) === null ? null : spot;
}

export function placeRouteLabels(requests, { viewSizePx, marks = [], previousChoices = new Map() }) {
  const ordered = [...requests].sort((first, second) => LABEL_ORDER_BY_MODE[first.mode] - LABEL_ORDER_BY_MODE[second.mode]);
  const knownMarks = marks.map(prepared);
  const placed = [];
  for (const request of ordered) {
    const key = routeLabelKey(request);
    const previousChoice = previousChoices.get(key);
    const kept = keptSpot(request, previousChoice, knownMarks, viewSizePx);
    const spot = kept ?? bestSpot(request, knownMarks, viewSizePx);
    if (!spot) continue;
    const { centre, box, anchor, leaderEnd, choice } = spot;
    placed.push({
      key,
      choice,
      movedFrom: !kept && previousChoice ? previousChoice : null,
      text: request.text, mode: request.mode, legMode: request.legMode, lineId: request.lineId,
      x: centre.x, y: centre.y, widthPx: request.widthPx, heightPx: request.heightPx,
      box, leader: { from: anchor, to: leaderEnd },
    });
    knownMarks.push({ shape: 'box', box, importance: 'hard' });
    knownMarks.push(prepared({ shape: 'line', points: [anchor, leaderEnd], halfWidthPx: 1, importance: 'hard' }));
  }
  return placed;
}

const CALLOUT_DIRECTIONS = Object.freeze([[1, -1], [-1, -1], [1, 1], [-1, 1], [1, 0], [-1, 0], [0, -1], [0, 1]]);
const CALLOUT_REACHES_PX = Object.freeze([40, 64, 96]);
const COST_PER_CALLOUT_STEP = 1;
const COST_OF_A_CROSSED_LINE = 50;

function edgeStartPx(cornerPx, sign, sizePx) {
  if (sign > 0) return cornerPx;
  if (sign < 0) return cornerPx - sizePx;
  return cornerPx - sizePx / 2;
}

function calloutBox(pointPx, [across, down], reachPx, { widthPx, heightPx }) {
  const length = Math.hypot(across, down);
  const corner = { x: pointPx.x + (across / length) * reachPx, y: pointPx.y + (down / length) * reachPx };
  const left = edgeStartPx(corner.x, across, widthPx);
  const top = edgeStartPx(corner.y, down, heightPx);
  return { box: { left, right: left + widthPx, top, bottom: top + heightPx }, tail: corner };
}

export function placeCallout({ pointPx, widthPx, heightPx }, { viewSizePx, marks = [] }) {
  const ready = marks.map(prepared);
  let best = null;
  CALLOUT_REACHES_PX.forEach((reachPx, reachIndex) => {
    CALLOUT_DIRECTIONS.forEach((direction, directionIndex) => {
      const spot = calloutBox(pointPx, direction, reachPx, { widthPx, heightPx });
      if (!insideView(spot.box, viewSizePx)) return;
      if (ready.some((mark) => mark.importance === 'hard' && markTouchesBox(mark, spot.box))) return;
      const crossed = ready.filter((mark) => mark.shape === 'line' && markCrossesLeader(mark, spot.tail, pointPx)).length;
      const softCovered = ready.filter((mark) => mark.importance !== 'hard' && markTouchesBox(mark, spot.box)).length;
      const cost = (reachIndex * CALLOUT_DIRECTIONS.length + directionIndex) * COST_PER_CALLOUT_STEP + crossed * COST_OF_A_CROSSED_LINE + softCovered * COST_OF_COVERING_A_SOFT_MARK;
      if (!best || cost < best.cost) best = { ...spot, cost };
    });
  });
  return best && { box: best.box, tail: best.tail };
}
