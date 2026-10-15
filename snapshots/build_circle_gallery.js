import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { METHOD } from '../src/method.js';
import { snapshotId, normalizeProviders } from '../src/sources.js';
import { withStreets } from '../src/streets.js';
import { withTimetable } from '../src/transit.js';
import { CIRCLE_HOME_RULE, circleCardsFor } from '../src/ui/grocery/circle_cards.js';

const snapshotFolder = new URL('./', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', snapshotFolder)));
const NETWORK_FILE = 'GDRTA_network@2026-10-03.json';
const STREETS_FILE = 'streets@2026-10-03.json';
const TIMETABLE_FILE = 'GDRTA_timetable@2026-10-03.json';
const SURFACE_FILE = 'travel-surface@2026-10-03.json';
export const CIRCLE_GALLERY_FILE = `circle-gallery@${manifest.fetched_on}.json`;

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(new URL(fileName, snapshotFolder)));
}

function layerFor(service) {
  return manifest.layers.find((layer) => layer.service === service);
}

export function circleGalleryInputs() {
  const pantryLayer = layerFor('MC_Pantries');
  const retailerLayer = layerFor('SNAP_or_WIC_Acceptance');
  const network = withTimetable(withStreets(readJson(NETWORK_FILE), readJson(STREETS_FILE)), readJson(TIMETABLE_FILE));
  const surface = readJson(SURFACE_FILE);
  return {
    network,
    supermarkets: normalizeProviders(readJson(pantryLayer.file), readJson(retailerLayer.file), METHOD).filter((place) => place.kind === 'supermarket'),
    populatedCells: surface.cells.filter((cell) => cell.populated),
    stamp: {
      methodVersion: METHOD.version,
      snapshotId: network.snapshotId,
      inputs: {
        network: network.snapshotId,
        streets: network.streets.snapshotId,
        timetable: network.timetable.snapshotId,
        pantries: snapshotId(pantryLayer),
        retailers: snapshotId(retailerLayer),
        surfaceCells: surface.cellsSha256,
      },
      homeRule: CIRCLE_HOME_RULE,
    },
  };
}

function buildCircleGalleryFile() {
  const { network, supermarkets, populatedCells, stamp } = circleGalleryInputs();
  return { ...stamp, cards: circleCardsFor(supermarkets, populatedCells, { network, method: METHOD }) };
}

const isRunDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isRunDirectly) {
  const startedAt = performance.now();
  const galleryFile = buildCircleGalleryFile();
  const text = `${JSON.stringify(galleryFile)}\n`;
  fs.writeFileSync(new URL(CIRCLE_GALLERY_FILE, snapshotFolder), text);
  console.log(`wrote snapshots/${CIRCLE_GALLERY_FILE}: ${galleryFile.cards.length} cards, ${text.length} bytes, ${((performance.now() - startedAt) / 1000).toFixed(1)} s`);
}
