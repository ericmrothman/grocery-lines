import { param } from './method.js';
import { haversineMi } from './geo.js';
import { nearestStreetNode, streetNodesNear, shortestPathTree, pathInTree, streetManeuvers } from './streets.js';

const SPEED_PARAMETER_BY_ROAD_CLASS = Object.freeze({
  motorway: 'motorwayMph',
  trunk: 'arterialMph',
  primary: 'arterialMph',
  motorway_link: 'arterialMph',
  trunk_link: 'arterialMph',
  primary_link: 'arterialMph',
  secondary: 'collectorMph',
  tertiary: 'collectorMph',
  secondary_link: 'collectorMph',
  tertiary_link: 'collectorMph',
  unclassified: 'localMph',
  residential: 'localMph',
  living_street: 'serviceRoadMph',
  service: 'serviceRoadMph',
});
const CACHED_START_TREES = 8;
const CACHED_END_TREES = 1000;
const DESTINATION_WALK_SEARCH_MILES = 3;
const WALK_SNAP_SLACK_MILES = 0.02;

const cachesByStreets = new WeakMap();

function cachesFor(streets) {
  if (!cachesByStreets.has(streets)) {
    cachesByStreets.set(streets, { nearestNodes: new Map(), walkEntries: new Map(), startTrees: new Map(), endTrees: new Map() });
  }
  return cachesByStreets.get(streets);
}

function remembered(cache, key, limit, compute) {
  if (cache.has(key)) {
    const value = cache.get(key);
    cache.delete(key);
    cache.set(key, value);
    return value;
  }
  const value = compute();
  cache.set(key, value);
  if (cache.size > limit) cache.delete(cache.keys().next().value);
  return value;
}

function nearestNode(streets, point, mode) {
  return remembered(cachesFor(streets).nearestNodes, `${mode}:${point.lat},${point.lon}`, Infinity, () => nearestStreetNode(streets, point, mode));
}

function walkEntries(streets, point) {
  return remembered(cachesFor(streets).walkEntries, `${point.lat},${point.lon}`, Infinity, () => streetNodesNear(streets, point, 'walk', WALK_SNAP_SLACK_MILES));
}

function cheapestEntry(tree, entries) {
  let best = null;
  for (const entry of entries) {
    const cost = tree.costOf(entry.node) + entry.distanceMi;
    if (cost < Infinity && (!best || cost < best.cost)) best = { ...entry, cost };
  }
  return best;
}

function carSpeedSignature(method) {
  return ['motorwayMph', 'arterialMph', 'collectorMph', 'localMph', 'serviceRoadMph', 'junctionDelayMin'].map((name) => param(method, name)).join(',');
}

function carEdgeCost(streets, method) {
  const mphByClass = streets.roadClasses.map((roadClass) => {
    const parameterName = SPEED_PARAMETER_BY_ROAD_CLASS[roadClass];
    return parameterName ? param(method, parameterName) : null;
  });
  const junctionDelayMin = param(method, 'junctionDelayMin');
  return (edge, nextNode) => (streets.edgeMiles[edge] / mphByClass[streets.edgeClass[edge]]) * 60
    + (streets.junctionDegree[nextNode] >= 3 ? junctionDelayMin : 0);
}

function walkEdgeCost(streets) {
  return (edge) => streets.edgeMiles[edge];
}

function carTreeFrom(streets, point, method) {
  const start = nearestNode(streets, point, 'car');
  const key = `car:${point.lat},${point.lon}|${carSpeedSignature(method)}`;
  return remembered(cachesFor(streets).startTrees, key, CACHED_START_TREES, () => ({ start, tree: shortestPathTree(streets, start.node, 'car', carEdgeCost(streets, method)) }));
}

function walkTreeFrom(streets, point, { searchMiles = Infinity, cache = 'startTrees', limit = CACHED_START_TREES } = {}) {
  const entries = walkEntries(streets, point);
  const key = `walk:${point.lat},${point.lon}|${searchMiles}`;
  return remembered(cachesFor(streets)[cache], key, limit, () => (entries.length === 0 ? null
    : shortestPathTree(streets, entries.map(({ node, distanceMi }) => ({ node, cost: distanceMi })), 'walk', walkEdgeCost(streets), { maximumCost: searchMiles })));
}

function walkBetween(streets, tree, entries) {
  const exit = tree && cheapestEntry(tree, entries);
  if (!exit) return null;
  const path = pathInTree(streets, tree, exit.node);
  return { path, rootMiles: path.rootCost, exitMiles: exit.distanceMi };
}

function straightLineFallback(from, to, mph, method) {
  const straightLineMiles = haversineMi(from, to);
  const circuityFactor = param(method, 'circuityFactor');
  const miles = straightLineMiles * circuityFactor;
  return { minutes: (miles / mph) * 60, miles, straightLineMiles, circuityFactor, mph, path: [[from.lon, from.lat], [to.lon, to.lat]], assumed: true, streetRouted: false };
}

export function drivingLeg(streets, from, to, method) {
  const { start, tree } = carTreeFrom(streets, from, method);
  const end = nearestNode(streets, to, 'car');
  const serviceRoadMph = param(method, 'serviceRoadMph');
  const streetPath = start && end ? pathInTree(streets, tree, end.node) : null;
  if (!streetPath) return straightLineFallback(from, to, param(method, 'localMph'), method);
  const connectorMiles = start.distanceMi + end.distanceMi;
  return {
    minutes: streetPath.cost + (connectorMiles / serviceRoadMph) * 60,
    miles: streetPath.miles + connectorMiles,
    streetMiles: streetPath.miles,
    connectorMiles,
    connectorMph: serviceRoadMph,
    junctionDelayMin: param(method, 'junctionDelayMin'),
    path: [[from.lon, from.lat], ...streetPath.line, [to.lon, to.lat]],
    streetEdges: streetPath.edges,
    startConnectorMiles: start.distanceMi,
    endConnectorMiles: end.distanceMi,
    assumed: false,
    streetRouted: true,
  };
}

function walkingResult(from, to, streetPath, { startConnectorMiles, endConnectorMiles }, method) {
  const walkMph = param(method, 'walkMph');
  const connectorMiles = endConnectorMiles + startConnectorMiles;
  const miles = streetPath.miles + connectorMiles;
  return {
    minutes: (miles / walkMph) * 60,
    miles,
    streetMiles: streetPath.miles,
    connectorMiles,
    mph: walkMph,
    path: [[from.lon, from.lat], ...streetPath.line, [to.lon, to.lat]],
    streetEdges: streetPath.edges,
    startConnectorMiles,
    endConnectorMiles,
    assumed: false,
    streetRouted: true,
  };
}

export function walkingLegFromStart(streets, from, to, method) {
  const walk = walkBetween(streets, walkTreeFrom(streets, from), walkEntries(streets, to));
  if (!walk) return straightLineFallback(from, to, param(method, 'walkMph'), method);
  return walkingResult(from, to, walk.path, { startConnectorMiles: walk.rootMiles, endConnectorMiles: walk.exitMiles }, method);
}

export function walkingLegToEnd(streets, from, to, method) {
  const tree = walkTreeFrom(streets, to, { searchMiles: DESTINATION_WALK_SEARCH_MILES, cache: 'endTrees', limit: CACHED_END_TREES });
  const walk = walkBetween(streets, tree, walkEntries(streets, from));
  if (!walk) return straightLineFallback(from, to, param(method, 'walkMph'), method);
  const forwardPath = {
    ...walk.path,
    line: [...walk.path.line].reverse(),
    edges: [...walk.path.edges].reverse().map(({ edge, forward }) => ({ edge, forward: !forward })),
  };
  return walkingResult(from, to, forwardPath, { startConnectorMiles: walk.exitMiles, endConnectorMiles: walk.rootMiles }, method);
}

export function legManeuvers(streets, component, method) {
  if (!component.streetEdges) return null;
  const driving = component.kind === 'drive';
  const connectorMph = driving ? component.connectorMph : component.mph;
  const edgeMinutes = driving ? carEdgeCost(streets, method) : (edge) => (streets.edgeMiles[edge] / component.mph) * 60;
  const connector = (miles) => ({ miles, minutes: (miles / connectorMph) * 60 });
  return streetManeuvers(streets, component.streetEdges, edgeMinutes, {
    startConnector: connector(component.startConnectorMiles),
    endConnector: connector(component.endConnectorMiles),
  });
}
