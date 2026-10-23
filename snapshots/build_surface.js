import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { METHOD } from '../src/method.js';
import { snapshotId, normalizeProviders, normalizeBlockGroups } from '../src/sources.js';
import { buildTravelSurface } from '../src/surface.js';
import { withStreets } from '../src/streets.js';
import { withTimetable } from '../src/transit.js';

const snapshotFolder = new URL('./', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', snapshotFolder)));
const NETWORK_FILE = 'GDRTA_network@2026-10-03.json';
const STREETS_FILE = 'streets@2026-10-03.json';
const TIMETABLE_FILE = 'GDRTA_timetable@2026-10-03.json';
const CENSUS_BLOCKS_FILE = 'census-blocks@2026-10-06.json';
const SURFACE_FILE = `travel-surface@${manifest.fetched_on}.json`;

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(new URL(fileName, snapshotFolder)));
}

function layerFor(service) {
  return manifest.layers.find((layer) => layer.service === service);
}

export function cellsContentHash(cells) {
  return createHash('sha256').update(JSON.stringify(cells)).digest('hex');
}

function buildSurfaceFile() {
  const pantryLayer = layerFor('MC_Pantries');
  const retailerLayer = layerFor('SNAP_or_WIC_Acceptance');
  const blockGroupLayer = layerFor('Quantile_Vehicle');
  const network = withTimetable(withStreets(readJson(NETWORK_FILE), readJson(STREETS_FILE)), readJson(TIMETABLE_FILE));
  const providers = normalizeProviders(readJson(pantryLayer.file), readJson(retailerLayer.file), METHOD);
  const blockGroups = normalizeBlockGroups(readJson(blockGroupLayer.file));
  const censusBlocks = readJson(CENSUS_BLOCKS_FILE);
  const inputs = {
    network: network.snapshotId,
    streets: network.streets.snapshotId,
    timetable: network.timetable.snapshotId,
    pantries: snapshotId(pantryLayer),
    retailers: snapshotId(retailerLayer),
    blockGroups: snapshotId(blockGroupLayer),
    censusBlocks: censusBlocks.snapshotId,
  };
  const surface = buildTravelSurface({ blockGroups, censusBlocks, providers, network, method: METHOD, inputs });
  return { ...surface, cellsSha256: cellsContentHash(surface.cells) };
}

const isRunDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isRunDirectly) {
  const startedAt = performance.now();
  const surfaceFile = buildSurfaceFile();
  const text = `${JSON.stringify(surfaceFile)}\n`;
  fs.writeFileSync(new URL(SURFACE_FILE, snapshotFolder), text);
  const populated = surfaceFile.cells.filter((cell) => cell.populated).length;
  console.log(`wrote snapshots/${SURFACE_FILE}: ${surfaceFile.cells.length} cells, ${populated} populated, ${surfaceFile.cells.length - populated} masked, ${text.length} bytes, ${((performance.now() - startedAt) / 1000).toFixed(1)} s`);
}
