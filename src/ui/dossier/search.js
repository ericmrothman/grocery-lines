import { lookUpZip } from '../../zips.js';

export const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
export const MINIMUM_SEARCH_INTERVAL_MS = 1000;
export const MONTGOMERY_COUNTY_VIEWBOX = Object.freeze({ west: -84.4857, north: 39.9230, east: -84.0510, south: 39.5782 });

export function nominatimSearchUrl(text) {
  const viewbox = MONTGOMERY_COUNTY_VIEWBOX;
  const url = new URL(NOMINATIM_SEARCH_URL);
  url.search = new URLSearchParams({
    q: text,
    format: 'jsonv2',
    limit: '5',
    countrycodes: 'us',
    viewbox: `${viewbox.west},${viewbox.north},${viewbox.east},${viewbox.south}`,
    bounded: '1',
  }).toString();
  return url.toString();
}

const PARTS_TOO_BROAD_FOR_A_LABEL = new Set(['United States', 'Ohio', 'Montgomery County']);
const LABEL_PART_LIMIT = 4;

function shortPlaceLabel(displayName) {
  if (typeof displayName !== 'string') return null;
  const parts = displayName.split(',').map((part) => part.trim()).filter((part) => part && !PARTS_TOO_BROAD_FOR_A_LABEL.has(part) && !/^\d{5}$/.test(part));
  return parts.slice(0, LABEL_PART_LIMIT).join(', ') || null;
}

export function parseNominatimResults(results) {
  if (!Array.isArray(results)) return [];
  return results
    .map((result) => ({ label: shortPlaceLabel(result.display_name), lat: Number(result.lat), lon: Number(result.lon) }))
    .filter(({ label, lat, lon }) => label && Number.isFinite(lat) && Number.isFinite(lon))
    .map(({ label, lat, lon }) => ({ label, point: { lat, lon, source: 'search' } }));
}

export function createSearchRateLimiter(clock, minimumIntervalMs = MINIMUM_SEARCH_INTERVAL_MS) {
  let lastRequestAtMs = null;
  return {
    tryToStartRequest() {
      const nowMs = clock();
      const waitMs = lastRequestAtMs === null ? 0 : lastRequestAtMs + minimumIntervalMs - nowMs;
      if (waitMs > 0) return { allowed: false, waitMs };
      lastRequestAtMs = nowMs;
      return { allowed: true, waitMs: 0 };
    },
  };
}

export async function searchForOrigin(text, { zipCentroids, rateLimiter, fetchJson, isInCounty }) {
  const trimmed = (text ?? '').trim();
  if (trimmed === '') return { status: 'empty' };
  const zipLookup = lookUpZip(trimmed, zipCentroids);
  if (zipLookup.status === 'found') return { status: 'found', point: zipLookup.point, zip: zipLookup.zip, label: null };
  if (zipLookup.status === 'not-in-county') return { status: 'not-in-county', query: trimmed };
  const permission = rateLimiter.tryToStartRequest();
  if (!permission.allowed) return { status: 'too-soon', waitMs: permission.waitMs };
  let results;
  try {
    results = parseNominatimResults(await fetchJson(nominatimSearchUrl(trimmed)));
  } catch {
    return { status: 'failed', query: trimmed };
  }
  if (results.length === 0) return { status: 'no-match', query: trimmed };
  const inCounty = results.find((result) => isInCounty(result.point));
  if (!inCounty) return { status: 'not-in-county', query: trimmed };
  return { status: 'found', point: inCounty.point, label: inCounty.label, zip: null };
}
