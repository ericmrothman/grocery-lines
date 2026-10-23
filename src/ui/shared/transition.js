export function easedShare(elapsedMs, durationMs) {
  if (durationMs <= 0 || elapsedMs >= durationMs) return 1;
  const share = Math.max(0, elapsedMs / durationMs);
  return share < 0.5 ? 2 * share * share : 1 - ((-2 * share + 2) ** 2) / 2;
}

export const STEP_TRANSITION = Object.freeze({ cellMs: 420, rippleMs: 380, cameraMs: 1600 });
const FARTHEST_GLIDE_DEGREES = 0.01;

export function transitionLengthMs(timing) {
  return timing.cellMs + timing.rippleMs;
}

function degreesApart(from, to) {
  const across = (to.lon - from.lon) * Math.cos((from.lat * Math.PI) / 180);
  return Math.hypot(to.lat - from.lat, across);
}

export function rippleDelaysMs(centres, origin, rippleMs) {
  if (!origin || rippleMs <= 0) return new Float32Array(centres.length);
  const distances = centres.map((centre) => degreesApart(origin, centre));
  const farthest = distances.reduce((most, distance) => Math.max(most, distance), 0);
  return Float32Array.from(distances, (distance) => (farthest > 0 ? (rippleMs * distance) / farthest : 0));
}

function cellShare(elapsedMs, delayMs, cellMs) {
  return easedShare(elapsedMs - delayMs, cellMs);
}

export function transitionFrame({ from, to, delaysMs, cellMs, verticesPerCell }, elapsedMs) {
  const frame = new Uint8Array(to.length);
  const cellBytes = verticesPerCell * 4;
  let isDone = true;
  for (let cell = 0; cell < delaysMs.length; cell++) {
    const start = cell * cellBytes;
    const share = cellShare(elapsedMs, delaysMs[cell], cellMs);
    if (share < 1) isDone = false;
    const fromHidden = from[start + 3] === 0;
    const toHidden = to[start + 3] === 0;
    for (let channel = 0; channel < 3; channel++) {
      const fromValue = fromHidden ? to[start + channel] : from[start + channel];
      const toValue = toHidden ? from[start + channel] : to[start + channel];
      frame[start + channel] = fromValue + (toValue - fromValue) * share;
    }
    frame[start + 3] = from[start + 3] + (to[start + 3] - from[start + 3]) * share;
    for (let vertex = 1; vertex < verticesPerCell; vertex++) frame.copyWithin(start + vertex * 4, start, start + 4);
  }
  return { colors: frame, isDone };
}

function presenceShare(entry, now, timing) {
  const progress = timing ? easedShare(now - entry.changedAt - entry.delayMs, timing.cellMs) : 1;
  return entry.isLeaving ? entry.fromShare * (1 - progress) : entry.fromShare + (1 - entry.fromShare) * progress;
}

export function presenceAfter(previous, marks, { now, origin, timing }) {
  const shownByKey = new Map(marks.map((mark) => [mark.key, mark]));
  const arriving = marks.filter((mark) => !previous.has(mark.key) || previous.get(mark.key).isLeaving);
  const leaving = [...previous.values()].filter((entry) => !entry.isLeaving && !shownByKey.has(entry.mark.key));
  const next = new Map([...previous].map(([key, entry]) => [key, shownByKey.has(key) && !entry.isLeaving ? { ...entry, mark: shownByKey.get(key) } : entry]));
  if (arriving.length === 0 && leaving.length === 0) return next;
  const delays = rippleDelaysMs([...arriving, ...leaving.map((entry) => entry.mark)], origin, timing?.rippleMs ?? 0);
  arriving.forEach((mark, index) => {
    const before = previous.get(mark.key);
    next.set(mark.key, { mark, changedAt: now, delayMs: delays[index], isLeaving: false, fromShare: before ? presenceShare(before, now, timing) : 0 });
  });
  leaving.forEach((entry, index) => next.set(entry.mark.key, { ...entry, changedAt: now, delayMs: delays[arriving.length + index], isLeaving: true, fromShare: presenceShare(entry, now, timing) }));
  return next;
}

export function presenceNow(presence, now, timing) {
  const shown = [];
  const kept = new Map();
  let isMoving = false;
  for (const [key, entry] of presence) {
    const share = presenceShare(entry, now, timing);
    if (entry.isLeaving && share <= 0) continue;
    kept.set(key, entry);
    shown.push({ mark: entry.mark, share, isLeaving: entry.isLeaving });
    if (entry.isLeaving || share < 1) isMoving = true;
  }
  return { shown, kept, isMoving };
}

export function glideAfter(glide, to, { now, timing }) {
  if (!to) return glide && !glide.isLeaving ? { from: glidePoint(glide, now, timing), to: glidePoint(glide, now, timing), startedAt: now, isLeaving: true } : glide;
  if (!glide || glide.isLeaving) return { from: to, to, startedAt: now, isArriving: true };
  if (glide.to.lat === to.lat && glide.to.lon === to.lon) return glide;
  const from = glidePoint(glide, now, timing);
  if (degreesApart(from, to) > FARTHEST_GLIDE_DEGREES) return { from: to, to, startedAt: now, leftFrom: from };
  return { from, to, startedAt: now };
}

export function glideMarks(glide, now, timing) {
  if (!glide) return [];
  const share = timing ? easedShare(now - glide.startedAt, transitionLengthMs(timing)) : 1;
  if (glide.isLeaving) return share >= 1 ? [] : [{ point: glide.to, share: 1 - share }];
  if (glide.isArriving) return [{ point: glide.to, share }];
  if (!glide.leftFrom || share >= 1) return [{ point: glidePoint(glide, now, timing), share: 1 }];
  return [{ point: glide.leftFrom, share: 1 - share }, { point: glide.to, share }];
}

export function glidePoint(glide, now, timing) {
  if (!glide) return null;
  const share = timing ? easedShare(now - glide.startedAt, transitionLengthMs(timing)) : 1;
  return { lat: glide.from.lat + (glide.to.lat - glide.from.lat) * share, lon: glide.from.lon + (glide.to.lon - glide.from.lon) * share };
}
