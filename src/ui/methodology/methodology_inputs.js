import { carlessHouseholdFacts } from '../../audit.js';
import { highNeedCells, highNeedSummary, highNeedSensitivity } from '../map/high_need.js';

function median(values) {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = sorted.length / 2;
  return sorted.length % 2 === 1 ? sorted[middle - 0.5] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function methodologyInputs({ cells, blockGroups, network, method }) {
  const carlessPctByGeoid = new Map(blockGroups.map((blockGroup) => [blockGroup.geoid, blockGroup.carlessPct]));
  const options = { carlessPctOf: (geoid) => carlessPctByGeoid.get(geoid) ?? null, method };
  const livedIn = cells.filter((cell) => cell.populated);
  return {
    facts: carlessHouseholdFacts(blockGroups, method),
    blockGroups: blockGroups.length,
    highNeed: highNeedSummary(highNeedCells(cells, options)),
    sensitivity: highNeedSensitivity(cells, options),
    grid: { hexagons: cells.length, livedIn: livedIn.length, medianDriveMin: median(livedIn.map((cell) => cell.layers.supermarket.car.minutes)) },
    transit: { routes: network.routes.length, stops: network.timetable.stops.length },
  };
}
