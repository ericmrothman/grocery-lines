export const DRAWER_SNAPS = Object.freeze(['peek', 'half', 'full']);
export const PEEK_HEIGHT_PX = 120;
export const HALF_HEIGHT_SHARE = 0.45;
export const FULL_HEIGHT_SHARE = 0.9;

export function drawerHeightPx(snap, viewportHeightPx) {
  if (snap === 'peek') return PEEK_HEIGHT_PX;
  if (snap === 'half') return viewportHeightPx * HALF_HEIGHT_SHARE;
  if (snap === 'full') return viewportHeightPx * FULL_HEIGHT_SHARE;
  throw new Error(`Unknown drawer snap: ${snap}`);
}

function nearestSnap(heightPx, viewportHeightPx) {
  let nearest = DRAWER_SNAPS[0];
  for (const snap of DRAWER_SNAPS) {
    const distance = Math.abs(drawerHeightPx(snap, viewportHeightPx) - heightPx);
    if (distance < Math.abs(drawerHeightPx(nearest, viewportHeightPx) - heightPx)) nearest = snap;
  }
  return nearest;
}

export function reduceDrawer(snap, event) {
  switch (event.type) {
    case 'handleTapped':
      return DRAWER_SNAPS[(DRAWER_SNAPS.indexOf(snap) + 1) % DRAWER_SNAPS.length];
    case 'dragEnded':
      return nearestSnap(event.heightPx, event.viewportHeightPx);
    case 'summaryTapped':
      return snap === 'peek' ? 'half' : snap;
    default:
      throw new Error(`Unknown drawer event: ${event.type}`);
  }
}

const COLLAPSING_EVENTS = Object.freeze(['focusBack', 'focusCleared', 'escapePressed', 'mapOptionsToggled', 'homeOpened']);

export function drawerAfter(snap, residentEvent) {
  return COLLAPSING_EVENTS.includes(residentEvent.type) ? 'peek' : snap;
}

export function drawerContent(snap, hasSelection) {
  if (!hasSelection) return 'empty';
  return snap === 'peek' ? 'summary' : 'card';
}
