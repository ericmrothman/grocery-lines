import { param, withOverrides } from '../../method.js';
import { SCENARIO_TRANSIT_THRESHOLDS_MIN, SCENARIO_CARLESS_PCTS } from '../../audit.js';
import { isPastLine, isOverCarlessLine, FINDINGS_PERIOD } from '../shared/lens.js';
import { hexOutline } from './hex_outline.js';

export function isHighNeedCell(cell, { carlessPctOf, method, lineMin = param(method, 'desertTransitMin'), period = FINDINGS_PERIOD }) {
  return Boolean(cell.populated) && isPastLine(cell, method, lineMin, period) && isOverCarlessLine(carlessPctOf(cell.geoid) ?? null, method);
}

export function highNeedCells(cells, options) {
  return cells.flatMap((cell, index) => {
    if (!isHighNeedCell(cell, options)) return [];
    const carlessPct = options.carlessPctOf(cell.geoid);
    return [{ index, cell, carlessPct, carlessHouseholds: (cell.households * carlessPct) / 100 }];
  });
}

export function highNeedSummary(rows) {
  return {
    hexagons: rows.length,
    households: rows.reduce((sum, row) => sum + row.cell.households, 0),
    carlessHouseholds: rows.reduce((sum, row) => sum + row.carlessHouseholds, 0),
  };
}

export function highNeedSensitivity(cells, { carlessPctOf, method }) {
  const rowsAt = (carlessPct, lineMin, period = FINDINGS_PERIOD) => highNeedCells(cells, { carlessPctOf, method: withOverrides(method, { desertCarlessPct: carlessPct }), lineMin, period });
  const grid = SCENARIO_CARLESS_PCTS.map((carlessPct) => ({ carlessPct, byLine: SCENARIO_TRANSIT_THRESHOLDS_MIN.map((lineMin) => ({ lineMin, rows: rowsAt(carlessPct, lineMin) })) }));
  const every = grid.flatMap((row) => row.byLine.map((cell) => new Set(cell.rows.map((each) => each.cell.id))));
  const published = rowsAt(param(method, 'desertCarlessPct'), param(method, 'desertTransitMin'));
  return {
    lines: SCENARIO_TRANSIT_THRESHOLDS_MIN,
    rows: grid.map((row) => ({ carlessPct: row.carlessPct, byLine: row.byLine.map((cell) => ({ lineMin: cell.lineMin, ...highNeedSummary(cell.rows) })) })),
    published: published.length,
    inEvery: published.filter((row) => every.every((ids) => ids.has(row.cell.id))).length,
    midday: rowsAt(param(method, 'desertCarlessPct'), param(method, 'desertTransitMin'), 'offPeak').length,
  };
}

export function highNeedOutline(rows, hexGrid) {
  return hexOutline(rows.map((row) => row.index), hexGrid);
}

const fixed = (digits) => (value) => (value === null || value === undefined ? null : value.toFixed(digits));
const COORDINATE = fixed(6);
const TENTHS = fixed(1);

const CSV_PERIODS = Object.freeze({ peak: 'rush_hour', offPeak: 'midday' });

const CSV_COLUMNS = Object.freeze([
  ['hexagon', ({ cell }) => cell.id],
  ['lat', ({ cell }) => COORDINATE(cell.lat)],
  ['lon', ({ cell }) => COORDINATE(cell.lon)],
  ['households', ({ cell }) => TENTHS(cell.households)],
  ['carless_percent', (row) => TENTHS(row.carlessPct)],
  ['carless_households', (row) => TENTHS(row.carlessHouseholds)],
  ['bus_minutes_to_supermarket', ({ cell }, { period }) => TENTHS(cell.layers.supermarket.transit[period]?.minutes)],
  ['nearest_supermarket_by_bus', ({ cell }, { supermarketNameOf, period }) => supermarketNameOf(cell.layers.supermarket.transit[period]?.placeId ?? null)],
  ['drive_minutes_to_supermarket', ({ cell }) => TENTHS(cell.layers.supermarket.car.minutes)],
  ['tract', ({ cell }) => cell.geoid.slice(0, 11)],
  ['block_group', ({ cell }) => cell.geoid],
  ['bus_line_minutes', (row, { lineMin }) => lineMin],
  ['time_of_day', (row, { period }) => CSV_PERIODS[period]],
  ['method_version', (row, { methodVersion }) => methodVersion],
  ['network_snapshot', (row, { inputs }) => inputs.network],
  ['timetable_snapshot', (row, { inputs }) => inputs.timetable],
  ['streets_snapshot', (row, { inputs }) => inputs.streets],
  ['block_groups_snapshot', (row, { inputs }) => inputs.blockGroups],
  ['retailers_snapshot', (row, { inputs }) => inputs.retailers],
]);

function csvField(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function highNeedCsv(rows, provenance) {
  const header = CSV_COLUMNS.map(([name]) => name).join(',');
  const lines = rows.map((row) => CSV_COLUMNS.map(([, valueOf]) => csvField(valueOf(row, provenance))).join(','));
  return `${[header, ...lines].join('\r\n')}\r\n`;
}
