import { param } from './method.js';
import { fastestTrips } from './mobility.js';

export const SCENARIO_TRANSIT_THRESHOLDS_MIN = Object.freeze([20, 25, 30]);
export const SCENARIO_CARLESS_PCTS = Object.freeze([10, 15, 20]);

export function fastestTrip(origin, destinations, network, method, period = 'peak') {
  const [fastest] = fastestTrips(origin, destinations, network, method, { period, count: 1 });
  return fastest ?? null;
}

function isVulnerable(blockGroup, method) {
  return blockGroup.carlessPct !== null && blockGroup.carlessPct > param(method, 'desertCarlessPct');
}

function householdTotals(blockGroups) {
  return {
    households: blockGroups.reduce((sum, blockGroup) => sum + blockGroup.households, 0),
    carlessHouseholds: blockGroups.reduce((sum, blockGroup) => sum + blockGroup.carlessHouseholds, 0),
  };
}

export function carlessHouseholdFacts(blockGroups, method) {
  const withHouseholds = blockGroups.filter((blockGroup) => blockGroup.households);
  const highNeed = withHouseholds.filter((blockGroup) => isVulnerable(blockGroup, method));
  return {
    county: householdTotals(withHouseholds),
    highNeed: { neighborhoods: highNeed.length, ...householdTotals(highNeed) },
  };
}
