const KEPT_FILES = 'snapshots-and-libraries';
const LAST_SEEN_PAGES = 'pages-and-code';
const DATED_SNAPSHOT = /^snapshots\/[^/]+@\d{4}-\d{2}-\d{2}\.[a-z]+$/;

function cacheRule(url, scope) {
  const home = new URL(scope);
  if (url.origin !== home.origin || !url.pathname.startsWith(home.pathname)) return 'network';
  const path = url.pathname.slice(home.pathname.length);
  if (DATED_SNAPSHOT.test(path) && path.endsWith('.pmtiles')) return 'ranges-from-kept-file';
  if (DATED_SNAPSHOT.test(path) || path.startsWith('vendor/')) return 'kept-file';
  if (path === '' || path.endsWith('.html') || path.startsWith('src/')) return 'newest-page';
  return 'network';
}

async function keptFile(request) {
  const cache = await caches.open(KEPT_FILES);
  const kept = await cache.match(request.url);
  if (kept) return kept;
  const response = await fetch(request);
  if (response.status === 200) await cache.put(request.url, response.clone());
  return response;
}

async function newestPage(request) {
  const cache = await caches.open(LAST_SEEN_PAGES);
  try {
    const response = await fetch(request);
    if (response.status === 200) await cache.put(request.url, response.clone());
    return response;
  } catch (offline) {
    const kept = await cache.match(request.url);
    if (kept) return kept;
    throw offline;
  }
}

function byteRange(header, size) {
  const [, first, last] = header.match(/^bytes=(\d*)-(\d*)$/) ?? [];
  if (first === undefined || (first === '' && last === '')) return null;
  if (first === '') return { start: Math.max(0, size - Number(last)), end: size - 1 };
  return { start: Number(first), end: Math.min(size - 1, last === '' ? size - 1 : Number(last)) };
}

async function rangeFromKeptFile(request, whileOpen) {
  const cache = await caches.open(KEPT_FILES);
  const kept = await cache.match(request.url);
  if (!kept) {
    whileOpen(fetch(request.url).then((whole) => (whole.status === 200 ? cache.put(request.url, whole) : undefined)).catch(() => undefined));
    return fetch(request);
  }
  const file = await kept.blob();
  const range = byteRange(request.headers.get('range') ?? '', file.size);
  if (!range) return new Response(file, { status: 200, headers: { 'Content-Type': kept.headers.get('Content-Type') ?? 'application/octet-stream' } });
  const piece = file.slice(range.start, range.end + 1);
  return new Response(piece, {
    status: 206,
    headers: {
      'Content-Type': kept.headers.get('Content-Type') ?? 'application/octet-stream',
      'Content-Range': `bytes ${range.start}-${range.end}/${file.size}`,
      'Content-Length': String(piece.size),
      'Accept-Ranges': 'bytes',
    },
  });
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const rule = cacheRule(new URL(event.request.url), self.registration.scope);
  if (rule === 'ranges-from-kept-file') event.respondWith(rangeFromKeptFile(event.request, (work) => event.waitUntil(work)));
  else if (event.request.headers.has('range')) return;
  else if (rule === 'kept-file') event.respondWith(keptFile(event.request));
  else if (rule === 'newest-page') event.respondWith(newestPage(event.request));
});
