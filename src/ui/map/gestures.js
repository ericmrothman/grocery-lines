export const TAP_MOVEMENT_LIMIT_PX = 6;
export const PIN_SNAP_RADIUS_PX = 24;

export function classifyPointerGesture({ largestMovementPx, mostPointersDown }) {
  if (mostPointersDown > 1) return 'pinch';
  return largestMovementPx < TAP_MOVEMENT_LIMIT_PX ? 'tap' : 'pan';
}

export function pinNearTap(tapPx, pinsPx, radiusPx = PIN_SNAP_RADIUS_PX) {
  let nearest = null;
  for (const pin of pinsPx) {
    const distancePx = Math.hypot(pin.x - tapPx.x, pin.y - tapPx.y);
    if (distancePx <= radiusPx && (!nearest || distancePx < nearest.distancePx)) nearest = { placeId: pin.placeId, distancePx };
  }
  return nearest ? nearest.placeId : null;
}

export const START_PIN_HIT_RADIUS_PX = 22;
export const START_PIN_HEAD_RISE_PX = 24;
export const START_PIN_HEAD_RADIUS_PX = 12;

export function startPinHeadCentre(startPx) {
  return { x: startPx.x, y: startPx.y - START_PIN_HEAD_RISE_PX };
}
const PIN_SNAP_MILES = 0.1;
const SMALLEST_PIN_SNAP_RADIUS_PX = 10;

export function pinSnapRadiusPx(pixelsPerMile) {
  return Math.min(PIN_SNAP_RADIUS_PX, Math.max(SMALLEST_PIN_SNAP_RADIUS_PX, pixelsPerMile * PIN_SNAP_MILES));
}

export function isOnStartPin(pointPx, startPx) {
  const head = startPinHeadCentre(startPx);
  return Math.hypot(pointPx.x - head.x, pointPx.y - head.y) <= START_PIN_HIT_RADIUS_PX;
}
