import { param } from './method.js';
import { milesPerDegreeAt, pointInPolygon } from './geo.js';
import { estimateDrive, estimateTransit, estimateWalk } from './mobility.js';

export const SURFACE_PERIODS = Object.freeze(['peak', 'offPeak']);
export const SURFACE_KINDS = Object.freeze({
  supermarket: Object.freeze({ anyHours: false }),
  pantry: Object.freeze({ anyHours: true }),
  'other-retailer': Object.freeze({ anyHours: false }),
});

const ROW_SPACING_PER_CELL_SIZE = Math.sqrt(3) / 2;

function boundingBoxOfRings(lonLatRings) {
  const corners = lonLatRings.flat();
  const longitudes = corners.map(([lon]) => lon);
  const latitudes = corners.map(([, lat]) => lat);
  return {
    minLon: Math.min(...longitudes),
    maxLon: Math.max(...longitudes),
    minLat: Math.min(...latitudes),
    maxLat: Math.max(...latitudes),
  };
}

function boxContains(boundingBox, point) {
  return point.lon >= boundingBox.minLon && point.lon <= boundingBox.maxLon
    && point.lat >= boundingBox.minLat && point.lat <= boundingBox.maxLat;
}

function countyBoundingBox(blockGroupsWithBoxes) {
  const boxes = blockGroupsWithBoxes.map(({ boundingBox }) => boundingBox);
  return {
    minLon: Math.min(...boxes.map((box) => box.minLon)),
    maxLon: Math.max(...boxes.map((box) => box.maxLon)),
    minLat: Math.min(...boxes.map((box) => box.minLat)),
    maxLat: Math.max(...boxes.map((box) => box.maxLat)),
  };
}

export function cellAreaSqMi(method) {
  const cellSizeMi = param(method, 'cellSizeMi');
  return ROW_SPACING_PER_CELL_SIZE * cellSizeMi * cellSizeMi;
}

function withBoundingBoxes(blockGroups) {
  return blockGroups.map((blockGroup) => ({ blockGroup, boundingBox: boundingBoxOfRings(blockGroup.geometry.coordinates) }));
}

function gridLayout(blockGroupsWithBoxes, method) {
  const county = countyBoundingBox(blockGroupsWithBoxes);
  const { milesPerLatitudeDegree, milesPerLongitudeDegree } = milesPerDegreeAt((county.minLat + county.maxLat) / 2);
  const cellSizeMi = param(method, 'cellSizeMi');
  return {
    layout: 'pointy-top hexagons on a flat projection; odd rows shift half a cell east',
    cellSizeMi,
    rowSpacingMi: cellSizeMi * ROW_SPACING_PER_CELL_SIZE,
    southWestCorner: { lat: county.minLat, lon: county.minLon },
    milesPerLatitudeDegree,
    milesPerLongitudeDegree,
    countyHeightMi: (county.maxLat - county.minLat) * milesPerLatitudeDegree,
    countyWidthMi: (county.maxLon - county.minLon) * milesPerLongitudeDegree,
  };
}

function isOddRow(row) {
  return Math.abs(row % 2) === 1;
}

function cellCentreMiles(layout, row, column) {
  const halfCellShiftOnOddRows = isOddRow(row) ? layout.cellSizeMi / 2 : 0;
  return {
    milesEast: column * layout.cellSizeMi + halfCellShiftOnOddRows - layout.cellSizeMi / 2,
    milesNorth: row * layout.rowSpacingMi,
  };
}

function cellCentre(layout, row, column) {
  const { milesEast, milesNorth } = cellCentreMiles(layout, row, column);
  return {
    lat: layout.southWestCorner.lat + milesNorth / layout.milesPerLatitudeDegree,
    lon: layout.southWestCorner.lon + milesEast / layout.milesPerLongitudeDegree,
  };
}

function milesFromSouthWestCorner(layout, point) {
  return {
    milesEast: (point.lon - layout.southWestCorner.lon) * layout.milesPerLongitudeDegree,
    milesNorth: (point.lat - layout.southWestCorner.lat) * layout.milesPerLatitudeDegree,
  };
}

function rowAndColumnKey(row, column) {
  return `${row}:${column}`;
}

const NEIGHBOURING_ROWS_TO_CHECK = Object.freeze([-1, 0, 1, 2]);
const NEIGHBOURING_COLUMNS_TO_CHECK = Object.freeze([-1, 0, 1]);

const CORNER_DIRECTIONS = Object.freeze([0, 1, 2, 3, 4, 5].map((corner) => ((60 * corner + 90) * Math.PI) / 180));

export function createHexSpatialIndex(grid, cells) {
  const indexByRowAndColumn = new Map(cells.map((cell, index) => [rowAndColumnKey(cell.row, cell.column), index]));
  const centres = Object.freeze(cells.map((cell) => Object.freeze(cellCentre(grid, cell.row, cell.column))));
  const cellRadiusMi = grid.cellSizeMi / Math.sqrt(3);
  const countyBounds = Object.freeze({
    south: grid.southWestCorner.lat,
    west: grid.southWestCorner.lon,
    north: grid.southWestCorner.lat + grid.countyHeightMi / grid.milesPerLatitudeDegree,
    east: grid.southWestCorner.lon + grid.countyWidthMi / grid.milesPerLongitudeDegree,
  });

  function closestCellNearby(point) {
    const { milesEast, milesNorth } = milesFromSouthWestCorner(grid, point);
    const rowBelow = Math.trunc(milesNorth / grid.rowSpacingMi);
    let nearest = null;
    for (const rowOffset of NEIGHBOURING_ROWS_TO_CHECK) {
      const row = rowBelow + rowOffset;
      const halfCellShift = isOddRow(row) ? grid.cellSizeMi / 2 : 0;
      const columnNear = Math.trunc((milesEast + grid.cellSizeMi / 2 - halfCellShift) / grid.cellSizeMi);
      for (const columnOffset of NEIGHBOURING_COLUMNS_TO_CHECK) {
        const index = indexByRowAndColumn.get(rowAndColumnKey(row, columnNear + columnOffset));
        if (index === undefined) continue;
        const centre = cellCentreMiles(grid, row, columnNear + columnOffset);
        const distanceSquared = (centre.milesEast - milesEast) ** 2 + (centre.milesNorth - milesNorth) ** 2;
        const isCloser = !nearest || distanceSquared < nearest.distanceSquared || (distanceSquared === nearest.distanceSquared && index < nearest.index);
        if (isCloser) nearest = { index, distanceSquared };
      }
    }
    return nearest;
  }

  function cellCorners(cellIndex) {
    const centre = centres[cellIndex];
    return CORNER_DIRECTIONS.map((angle) => [
      centre.lon + (cellRadiusMi * Math.cos(angle)) / grid.milesPerLongitudeDegree,
      centre.lat + (cellRadiusMi * Math.sin(angle)) / grid.milesPerLatitudeDegree,
    ]);
  }

  function nearestCellIndex(point) {
    const nearest = closestCellNearby(point);
    return nearest && Math.sqrt(nearest.distanceSquared) <= cellRadiusMi ? nearest.index : null;
  }

  function nearestCellCentre(point) {
    const nearest = closestCellNearby(point);
    return nearest ? centres[nearest.index] : null;
  }

  return Object.freeze({
    cellRadiusMi,
    cellCentres: () => centres,
    cellCentroid: (cellIndex) => centres[cellIndex],
    cellCorners,
    countyBounds: () => countyBounds,
    latitudeDegreesForMiles: (miles) => miles / grid.milesPerLatitudeDegree,
    nearestCellIndex,
    nearestCellCentre,
  });
}

function blockGroupContaining(point, blockGroupsWithBoxes) {
  const containing = blockGroupsWithBoxes.find(({ blockGroup, boundingBox }) => (
    boxContains(boundingBox, point) && pointInPolygon(point, blockGroup.geometry.coordinates)
  ));
  return containing ? containing.blockGroup : null;
}

function latticePositions(layout) {
  const positions = [];
  for (let row = 0; row * layout.rowSpacingMi <= layout.countyHeightMi + layout.rowSpacingMi; row++) {
    for (let column = 0; column * layout.cellSizeMi <= layout.countyWidthMi + layout.cellSizeMi; column++) {
      positions.push({ id: `r${row}c${column}`, row, column, ...cellCentre(layout, row, column) });
    }
  }
  return positions;
}

function flatDistanceSquared(layout, from, to) {
  const milesEast = (to.lon - from.lon) * layout.milesPerLongitudeDegree;
  const milesNorth = (to.lat - from.lat) * layout.milesPerLatitudeDegree;
  return milesEast * milesEast + milesNorth * milesNorth;
}

function nearestPosition(layout, positions, point) {
  let nearest = null;
  for (const position of positions) {
    const distanceSquared = flatDistanceSquared(layout, point, position);
    if (!nearest || distanceSquared < nearest.distanceSquared) nearest = { position, distanceSquared };
  }
  return nearest.position;
}

function cellFor(position, blockGroup, assignedBy) {
  return { ...position, geoid: blockGroup.geoid, assignedBy };
}

function giveEveryBlockGroupACell(cells, blockGroups, layout, positions) {
  const cellsById = new Map(cells.map((cell) => [cell.id, cell]));
  const cellCountByGeoid = new Map();
  for (const cell of cells) cellCountByGeoid.set(cell.geoid, (cellCountByGeoid.get(cell.geoid) ?? 0) + 1);
  for (const blockGroup of blockGroups) {
    if (cellCountByGeoid.has(blockGroup.geoid)) continue;
    const position = nearestPosition(layout, positions, blockGroup.centroid);
    const displaced = cellsById.get(position.id);
    if (displaced && cellCountByGeoid.get(displaced.geoid) === 1) {
      throw new Error(`Block groups ${displaced.geoid} and ${blockGroup.geoid} both need cell ${position.id}`);
    }
    if (displaced) cellCountByGeoid.set(displaced.geoid, cellCountByGeoid.get(displaced.geoid) - 1);
    cellsById.set(position.id, cellFor(position, blockGroup, 'interior-point'));
    cellCountByGeoid.set(blockGroup.geoid, 1);
  }
  const positionOrder = new Map(positions.map((position, index) => [position.id, index]));
  return [...cellsById.values()].sort((first, second) => positionOrder.get(first.id) - positionOrder.get(second.id));
}

export function blockGroupAt(point, blockGroups) {
  return blockGroupContaining(point, withBoundingBoxes(blockGroups));
}

function housingUnitsByCell(cells, censusBlocks, layout) {
  const cellsByGeoid = Map.groupBy(cells, (cell) => cell.geoid);
  const housingUnits = new Map(cells.map((cell) => [cell.id, 0]));
  for (const [blockGroupGeoid, units, points] of censusBlocks.blocks) {
    const candidates = cellsByGeoid.get(blockGroupGeoid);
    if (!candidates) throw new Error(`Census block group ${blockGroupGeoid} has homes but no cells`);
    for (const [lat, lon] of points) {
      const nearest = nearestPosition(layout, candidates, { lat, lon });
      housingUnits.set(nearest.id, housingUnits.get(nearest.id) + units / points.length);
    }
  }
  return housingUnits;
}

export function withHouseholds(cells, blockGroups, censusBlocks, layout, method) {
  const housingUnits = housingUnitsByCell(cells, censusBlocks, layout);
  const blockGroupUnits = new Map();
  for (const cell of cells) blockGroupUnits.set(cell.geoid, (blockGroupUnits.get(cell.geoid) ?? 0) + housingUnits.get(cell.id));
  const householdsOf = new Map(blockGroups.map((blockGroup) => [blockGroup.geoid, blockGroup.households ?? 0]));
  const maskLine = param(method, 'maskHouseholdsPerSqMi') * cellAreaSqMi(method);
  return cells.map((cell) => {
    const units = blockGroupUnits.get(cell.geoid);
    const households = units ? householdsOf.get(cell.geoid) * (housingUnits.get(cell.id) / units) : 0;
    return { ...cell, households, populated: households > 0 && households >= maskLine };
  });
}

export function buildHexCells(blockGroups, method, censusBlocks) {
  const blockGroupsWithBoxes = withBoundingBoxes(blockGroups);
  const layout = gridLayout(blockGroupsWithBoxes, method);
  const positions = latticePositions(layout);
  const cellsByCentre = [];
  for (const position of positions) {
    const blockGroup = blockGroupContaining(position, blockGroupsWithBoxes);
    if (blockGroup) cellsByCentre.push(cellFor(position, blockGroup, 'centre'));
  }
  const cells = giveEveryBlockGroupACell(cellsByCentre, blockGroups, layout, positions);
  return withHouseholds(cells, blockGroups, censusBlocks, layout, method);
}

function fastestOf(current, minutes, placeId) {
  if (minutes === null) return current;
  return !current || minutes < current.minutes ? { minutes, placeId } : current;
}

export function travelTimesFromCell(cell, providersByKind, network, method) {
  const origin = { lat: cell.lat, lon: cell.lon, source: 'surface-cell', cellId: cell.id };
  const layers = {};
  for (const [kind, providers] of Object.entries(providersByKind)) {
    let car = null;
    let walk = null;
    const transit = Object.fromEntries(SURFACE_PERIODS.map((period) => [period, null]));
    for (const provider of providers) {
      car = fastestOf(car, estimateDrive(origin, provider, network, method).totalMin, provider.id);
      walk = fastestOf(walk, estimateWalk(origin, provider, network, method).totalMin, provider.id);
      for (const period of SURFACE_PERIODS) {
        transit[period] = fastestOf(transit[period], estimateTransit(origin, provider, network, method, period).totalMin, provider.id);
      }
    }
    layers[kind] = { car, walk, transit };
  }
  return layers;
}

function providersGroupedByKind(providers) {
  return Object.fromEntries(Object.keys(SURFACE_KINDS).map((kind) => [kind, providers.filter((provider) => provider.kind === kind)]));
}

export function buildTravelSurface({ blockGroups, censusBlocks, providers, network, method, inputs }) {
  const providersByKind = providersGroupedByKind(providers);
  const cells = buildHexCells(blockGroups, method, censusBlocks).map((cell) => (
    ({ ...cell, layers: travelTimesFromCell(cell, providersByKind, network, method) })
  ));
  const grid = gridLayout(withBoundingBoxes(blockGroups), method);
  return {
    methodVersion: method.version,
    snapshotId: network.snapshotId,
    inputs,
    periods: SURFACE_PERIODS,
    kinds: Object.fromEntries(Object.entries(SURFACE_KINDS).map(([kind, flags]) => [kind, { ...flags, places: providersByKind[kind].length }])),
    grid,
    cells,
  };
}
