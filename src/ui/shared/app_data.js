import { METHOD } from '../../method.js';
import { normalizeProviders, normalizeBlockGroups, normalizeLilaTracts } from '../../sources.js';
import { withStreets } from '../../streets.js';
import { withTimetable } from '../../transit.js';

const snapshot = (file) => new URL(`../../../snapshots/${file}`, import.meta.url).href;

export const SNAPSHOT_FILES = Object.freeze({
  pantries: snapshot('MC_Pantries@2026-10-03.geojson'),
  retailers: snapshot('SNAP_or_WIC_Acceptance@2026-10-03.geojson'),
  blockGroups: snapshot('Quantile_Vehicle@2026-10-03.geojson'),
  lilaTracts: snapshot('Low_Income_Low_Access@2026-10-12.geojson'),
  network: snapshot('GDRTA_network@2026-10-03.json'),
  surface: snapshot('travel-surface@2026-10-03.json'),
  zips: snapshot('zip-centroids@2026-10-03.json'),
  streets: snapshot('streets@2026-10-03.json'),
  timetable: snapshot('GDRTA_timetable@2026-10-03.json'),
});

export const CIRCLE_GALLERY_SNAPSHOT = snapshot('circle-gallery@2026-10-03.json');

export async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

export async function loadData() {
  const entries = await Promise.all(Object.entries(SNAPSHOT_FILES).map(async ([name, url]) => [name, await fetchJson(url)]));
  const files = Object.fromEntries(entries);
  return {
    providers: normalizeProviders(files.pantries, files.retailers, METHOD),
    blockGroups: normalizeBlockGroups(files.blockGroups),
    lilaTracts: normalizeLilaTracts(files.lilaTracts),
    network: withTimetable(withStreets(files.network, files.streets), files.timetable),
    surface: files.surface,
    zipCentroids: files.zips,
  };
}
