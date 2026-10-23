import { classifyPointerGesture, pinNearTap, pinSnapRadiusPx, isOnStartPin } from './gestures.js';
import { element } from '../shared/dom.js';
import { kindMarkElement } from '../shared/icons.js';

const DOUBLE_TAP_WINDOW_MS = 260;
const CELL_HOVER_OFFSET_PX = 8;

export function createMapInteraction(container, { map, hexGrid, isInteractive, startPoint, shownPins, toPixels, pixelsPerMile, describePlace, describeCell, onPlaceTapped, onPointTapped, onEmptyMapTapped, onStartDropped, showStartCell, requestOverlayDraw }) {
  let draggedStart = null;
  let hoveredCellIndex = null;

  function pointInContainer(event) {
    const box = container.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  function startPx() {
    const start = startPoint();
    return start ? toPixels(start) : null;
  }

  const pointersDown = new Map();
  let startGrabOffset = { x: 0, y: 0 };
  let gesture = null;

  container.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.maplibregl-ctrl')) return;
    const pointPx = pointInContainer(event);
    const currentStartPx = startPx();
    if (isInteractive() && pointersDown.size === 0 && currentStartPx && isOnStartPin(pointPx, currentStartPx)) {
      map.dragPan.disable();
      container.setPointerCapture(event.pointerId);
      container.classList.add('is-dragging-start');
      startGrabOffset = { x: pointPx.x - currentStartPx.x, y: pointPx.y - currentStartPx.y };
      draggedStart = { ...startPoint() };
      showStartCell();
      event.stopPropagation();
      return;
    }
    pointersDown.set(event.pointerId, pointPx);
    if (!gesture) gesture = { startX: event.clientX, startY: event.clientY, largestMovementPx: 0, mostPointersDown: 0 };
    gesture.mostPointersDown = Math.max(gesture.mostPointersDown, pointersDown.size);
  }, true);

  container.addEventListener('pointermove', (event) => {
    const pointPx = pointInContainer(event);
    if (draggedStart) {
      const latLng = map.unproject([pointPx.x - startGrabOffset.x, pointPx.y - startGrabOffset.y]);
      draggedStart = { lat: latLng.lat, lon: latLng.lng };
      requestOverlayDraw();
      return;
    }
    const currentStartPx = startPx();
    container.classList.toggle('is-over-start', Boolean(isInteractive() && currentStartPx && isOnStartPin(pointPx, currentStartPx)));
    if (!gesture || !pointersDown.has(event.pointerId)) return;
    gesture.largestMovementPx = Math.max(gesture.largestMovementPx, Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY));
  });

  function pointerReleased(event) {
    if (draggedStart) {
      const dropped = draggedStart;
      draggedStart = null;
      map.dragPan.enable();
      container.classList.remove('is-dragging-start');
      if (event.type === 'pointerup') onStartDropped(dropped);
      showStartCell();
      requestOverlayDraw();
      return;
    }
    if (!pointersDown.has(event.pointerId)) return;
    pointersDown.delete(event.pointerId);
    if (pointersDown.size > 0 || !gesture) return;
    const finishedGesture = gesture;
    gesture = null;
    if (!isInteractive() || event.type !== 'pointerup' || classifyPointerGesture(finishedGesture) !== 'tap') return;
    hoverCard.hidden = true;
    const tapPx = pointInContainer(event);
    const placeId = pinNearTap(tapPx, shownPins(), pinSnapRadiusPx(pixelsPerMile()));
    if (placeId) {
      onPlaceTapped(placeId);
      return;
    }
    const tapped = map.unproject([tapPx.x, tapPx.y]);
    const point = { lat: tapped.lat, lon: tapped.lng };
    clearTimeout(emptyTapTimer);
    emptyTapTimer = setTimeout(() => (onPointTapped ? onPointTapped(point) : onEmptyMapTapped()), DOUBLE_TAP_WINDOW_MS);
  }

  let emptyTapTimer = null;
  document.addEventListener('pointerdown', () => clearTimeout(emptyTapTimer), true);

  const hoverCard = document.createElement('div');
  hoverCard.className = 'place-hover';
  hoverCard.hidden = true;
  container.append(hoverCard);

  function showPlaceUnderMouse(event) {
    const isMouseHovering = event.pointerType === 'mouse' && event.buttons === 0 && !draggedStart;
    const pointPx = pointInContainer(event);
    const placeId = isMouseHovering ? pinNearTap(pointPx, shownPins(), pinSnapRadiusPx(pixelsPerMile())) : null;
    container.classList.toggle('is-over-place', Boolean(placeId));
    if (!placeId) {
      showCellUnderMouse(isMouseHovering ? pointPx : null);
      return;
    }
    const pin = shownPins().find((candidate) => candidate.placeId === placeId);
    const { kind, title, detail } = describePlace(placeId);
    hoverCard.classList.remove('is-cell');
    showHoveredCell(null);
    hoverCard.replaceChildren(element('strong', {}, [kindMarkElement(kind), document.createTextNode(title)]), element('span', { text: detail ?? '' }));
    hoverCard.style.left = `${pin.x}px`;
    hoverCard.style.top = `${pin.y}px`;
    hoverCard.hidden = false;
  }

  function showHoveredCell(cellIndex) {
    if (cellIndex === hoveredCellIndex) return;
    hoveredCellIndex = cellIndex;
    requestOverlayDraw();
  }

  function showCellUnderMouse(pointPx) {
    const lngLat = pointPx ? map.unproject([pointPx.x, pointPx.y]) : null;
    const cellIndex = lngLat ? hexGrid.nearestCellIndex({ lat: lngLat.lat, lon: lngLat.lng }) : null;
    const described = cellIndex === null ? null : describeCell(cellIndex);
    showHoveredCell(described ? cellIndex : null);
    if (!described) {
      hoverCard.hidden = true;
      return;
    }
    hoverCard.classList.add('is-cell');
    hoverCard.replaceChildren(element('span', { text: described }));
    hoverCard.style.left = `${pointPx.x}px`;
    hoverCard.style.top = `${pointPx.y - CELL_HOVER_OFFSET_PX}px`;
    hoverCard.hidden = false;
  }

  container.addEventListener('pointermove', showPlaceUnderMouse);
  container.addEventListener('pointerleave', () => {
    hoverCard.hidden = true;
    showHoveredCell(null);
  });
  container.addEventListener('pointerup', pointerReleased);
  container.addEventListener('pointercancel', pointerReleased);

  return {
    draggedStart: () => draggedStart,
    hoveredCellIndex: () => hoveredCellIndex,
    cancelStartDrag() {
      if (!draggedStart) return false;
      draggedStart = null;
      map.dragPan.enable();
      container.classList.remove('is-dragging-start');
      showStartCell();
      requestOverlayDraw();
      return true;
    },
  };
}
