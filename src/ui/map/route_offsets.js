const LANE_ORDER = Object.freeze(['car', 'walk', 'bus']);

function distanceToSegment(point, segmentStart, segmentEnd) {
  const alongX = segmentEnd.x - segmentStart.x;
  const alongY = segmentEnd.y - segmentStart.y;
  const lengthSquared = alongX * alongX + alongY * alongY;
  const share = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - segmentStart.x) * alongX + (point.y - segmentStart.y) * alongY) / lengthSquared));
  return Math.hypot(point.x - (segmentStart.x + alongX * share), point.y - (segmentStart.y + alongY * share));
}

function passesNear(point, linePoints, distancePx) {
  if (linePoints.length === 1) return Math.hypot(point.x - linePoints[0].x, point.y - linePoints[0].y) <= distancePx;
  for (let index = 1; index < linePoints.length; index++) {
    if (distanceToSegment(point, linePoints[index - 1], linePoints[index]) <= distancePx) return true;
  }
  return false;
}

function unitNormalAt(points, index) {
  const before = points[Math.max(0, index - 1)];
  const after = points[Math.min(points.length - 1, index + 1)];
  const alongX = after.x - before.x;
  const alongY = after.y - before.y;
  const length = Math.hypot(alongX, alongY);
  return length === 0 ? { x: 0, y: 0 } : { x: -alongY / length, y: alongX / length };
}

function tripsSharingThePoint(point, ownTrip, lines, touchingPx) {
  const sharing = new Set([ownTrip]);
  for (const other of lines) {
    if (other.trip !== ownTrip && !sharing.has(other.trip) && passesNear(point, other.points, touchingPx)) sharing.add(other.trip);
  }
  return LANE_ORDER.filter((trip) => sharing.has(trip));
}

export function sideBySideLines(lines, { laneSpacingPx, touchingPx }) {
  return lines.map((line) => {
    const points = line.points.map((point, index) => {
      const sharing = tripsSharingThePoint(point, line.trip, lines, touchingPx);
      if (sharing.length === 1) return { x: point.x, y: point.y };
      const lane = sharing.indexOf(line.trip) - (sharing.length - 1) / 2;
      const normal = unitNormalAt(line.points, index);
      return { x: point.x + normal.x * lane * laneSpacingPx, y: point.y + normal.y * lane * laneSpacingPx };
    });
    return { ...line, points };
  });
}
