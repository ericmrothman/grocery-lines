import { haversineMi, milesPerDegreeAt } from './geo.js';

const METRES_PER_MILE = 1609.344;
const SEARCH_START_MILES = 0.25;
const SEARCH_LIMIT_MILES = 8;
const ACCESS = Object.freeze({ carForward: 1, carBackward: 2, walk: 4 });

function outgoingLists(nodeCount, edgeFrom, edgeTo, edgeAccess, travelsForward, travelsBackward) {
  const counts = new Int32Array(nodeCount + 1);
  for (let edge = 0; edge < edgeFrom.length; edge++) {
    if (travelsForward(edgeAccess[edge])) counts[edgeFrom[edge] + 1] += 1;
    if (travelsBackward(edgeAccess[edge])) counts[edgeTo[edge] + 1] += 1;
  }
  for (let node = 0; node < nodeCount; node++) counts[node + 1] += counts[node];
  const starts = counts.slice();
  const filled = counts.slice(0, nodeCount);
  const edges = new Int32Array(counts[nodeCount]);
  const forward = new Uint8Array(counts[nodeCount]);
  for (let edge = 0; edge < edgeFrom.length; edge++) {
    if (travelsForward(edgeAccess[edge])) {
      edges[filled[edgeFrom[edge]]] = edge;
      forward[filled[edgeFrom[edge]]] = 1;
      filled[edgeFrom[edge]] += 1;
    }
    if (travelsBackward(edgeAccess[edge])) {
      edges[filled[edgeTo[edge]]] = edge;
      forward[filled[edgeTo[edge]]] = 0;
      filled[edgeTo[edge]] += 1;
    }
  }
  return { starts, edges, forward };
}

function nodesSortedByLatitude(nodeLat, usable) {
  const nodes = [];
  for (let node = 0; node < nodeLat.length; node++) if (usable[node]) nodes.push(node);
  nodes.sort((southern, northern) => nodeLat[southern] - nodeLat[northern]);
  return { nodes: Int32Array.from(nodes), latitudes: Float64Array.from(nodes, (node) => nodeLat[node]) };
}

function firstIndexAtOrNorthOf(sortedLatitudes, latitude) {
  let low = 0;
  let high = sortedLatitudes.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (sortedLatitudes[middle] < latitude) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function streetNetworkFrom({ snapshotId, roadClasses, nodes, edges }) {
  const nodeCount = nodes.length;
  const nodeLat = Float64Array.from(nodes, (node) => node.lat);
  const nodeLon = Float64Array.from(nodes, (node) => node.lon);
  const edgeFrom = Int32Array.from(edges, (edge) => edge.from);
  const edgeTo = Int32Array.from(edges, (edge) => edge.to);
  const edgeClass = Uint8Array.from(edges, (edge) => roadClasses.indexOf(edge.roadClass));
  const edgeAccess = Uint8Array.from(edges, (edge) => edge.access);
  const edgeMiles = Float64Array.from(edges, (edge) => edge.lengthMetres / METRES_PER_MILE);
  const edgeShapes = edges.map((edge) => edge.shape);
  const edgeNames = edges.map((edge) => edge.name ?? null);
  const car = outgoingLists(nodeCount, edgeFrom, edgeTo, edgeAccess,
    (access) => (access & ACCESS.carForward) !== 0, (access) => (access & ACCESS.carBackward) !== 0);
  const walk = outgoingLists(nodeCount, edgeFrom, edgeTo, edgeAccess,
    (access) => (access & ACCESS.walk) !== 0, (access) => (access & ACCESS.walk) !== 0);
  const hasCarEdge = new Uint8Array(nodeCount);
  const hasWalkEdge = new Uint8Array(nodeCount);
  const junctionDegree = new Uint8Array(nodeCount);
  for (let edge = 0; edge < edgeFrom.length; edge++) {
    const carUsable = (edgeAccess[edge] & (ACCESS.carForward | ACCESS.carBackward)) !== 0;
    const walkUsable = (edgeAccess[edge] & ACCESS.walk) !== 0;
    for (const node of [edgeFrom[edge], edgeTo[edge]]) {
      if (carUsable) {
        hasCarEdge[node] = 1;
        junctionDegree[node] = Math.min(255, junctionDegree[node] + 1);
      }
      if (walkUsable) hasWalkEdge[node] = 1;
    }
  }
  return {
    snapshotId,
    roadClasses,
    nodeLat,
    nodeLon,
    edgeFrom,
    edgeTo,
    edgeClass,
    edgeMiles,
    edgeShapes,
    edgeNames,
    junctionDegree,
    outgoing: { car, walk },
    byLatitude: { car: nodesSortedByLatitude(nodeLat, hasCarEdge), walk: nodesSortedByLatitude(nodeLat, hasWalkEdge) },
  };
}

function streetNamesOfEdges(streetNames, edgeCount) {
  if (!streetNames) return new Array(edgeCount).fill(null);
  let nameIndex = 0;
  return streetNames.edgeNameSteps.map((step) => {
    if (step === null) return null;
    nameIndex += step;
    return streetNames.table[nameIndex];
  });
}

export function decodeStreetNetwork(snapshot) {
  const scale = snapshot.nodes.coordinateScale;
  const nodes = [];
  const scaledNodes = [];
  let lonScaled = 0;
  let latScaled = 0;
  snapshot.nodes.longitudeDeltas.forEach((longitudeDelta, index) => {
    lonScaled += longitudeDelta;
    latScaled += snapshot.nodes.latitudeDeltas[index];
    scaledNodes.push({ lon: lonScaled, lat: latScaled });
    nodes.push({ lon: lonScaled / scale, lat: latScaled / scale });
  });
  const columns = snapshot.edges;
  const edgeNames = streetNamesOfEdges(snapshot.streetNames, columns.fromDeltas.length);
  const edges = [];
  let fromIndex = 0;
  let shapeCursor = 0;
  columns.fromDeltas.forEach((fromDelta, edgeIndex) => {
    fromIndex += fromDelta;
    const shape = [];
    let shapeLon = scaledNodes[fromIndex].lon;
    let shapeLat = scaledNodes[fromIndex].lat;
    for (let point = 0; point < columns.shapePointCounts[edgeIndex]; point++) {
      shapeLon += columns.shapeDeltas[shapeCursor];
      shapeLat += columns.shapeDeltas[shapeCursor + 1];
      shapeCursor += 2;
      shape.push([shapeLon / scale, shapeLat / scale]);
    }
    edges.push({
      from: fromIndex,
      to: fromIndex + columns.toMinusFrom[edgeIndex],
      roadClass: snapshot.roadClasses[columns.roadClass[edgeIndex]],
      access: columns.access[edgeIndex],
      lengthMetres: columns.lengthDecimetres[edgeIndex] / 10,
      shape,
      name: edgeNames[edgeIndex],
    });
  });
  return streetNetworkFrom({ snapshotId: snapshot.snapshotId, roadClasses: snapshot.roadClasses, nodes, edges });
}

export function nearestStreetNode(streets, point, mode) {
  const index = streets.byLatitude[mode];
  const { milesPerLatitudeDegree, milesPerLongitudeDegree } = milesPerDegreeAt(point.lat);
  for (let searchMiles = SEARCH_START_MILES; searchMiles <= SEARCH_LIMIT_MILES; searchMiles *= 2) {
    const latitudeMargin = searchMiles / milesPerLatitudeDegree;
    const longitudeMargin = searchMiles / milesPerLongitudeDegree;
    let nearest = null;
    const southernmost = firstIndexAtOrNorthOf(index.latitudes, point.lat - latitudeMargin);
    for (let position = southernmost; position < index.nodes.length && index.latitudes[position] <= point.lat + latitudeMargin; position++) {
      const node = index.nodes[position];
      if (Math.abs(streets.nodeLon[node] - point.lon) > longitudeMargin) continue;
      const distanceMi = haversineMi(point, { lat: streets.nodeLat[node], lon: streets.nodeLon[node] });
      if (!nearest || distanceMi < nearest.distanceMi) nearest = { node, distanceMi };
    }
    if (nearest && nearest.distanceMi <= searchMiles) return nearest;
  }
  return null;
}

export function streetNodesNear(streets, point, mode, slackMi) {
  const nearest = nearestStreetNode(streets, point, mode);
  if (!nearest) return [];
  const reachMi = nearest.distanceMi + slackMi;
  const index = streets.byLatitude[mode];
  const { milesPerLatitudeDegree, milesPerLongitudeDegree } = milesPerDegreeAt(point.lat);
  const nodes = [];
  const southernmost = firstIndexAtOrNorthOf(index.latitudes, point.lat - reachMi / milesPerLatitudeDegree);
  for (let position = southernmost; position < index.nodes.length && index.latitudes[position] <= point.lat + reachMi / milesPerLatitudeDegree; position++) {
    const node = index.nodes[position];
    if (Math.abs(streets.nodeLon[node] - point.lon) > reachMi / milesPerLongitudeDegree) continue;
    const distanceMi = haversineMi(point, { lat: streets.nodeLat[node], lon: streets.nodeLon[node] });
    if (distanceMi <= reachMi) nodes.push({ node, distanceMi });
  }
  return nodes;
}

function pushHeap(heapNodes, heapCosts, size, node, cost) {
  let position = size;
  heapNodes[position] = node;
  heapCosts[position] = cost;
  while (position > 0) {
    const parent = (position - 1) >> 1;
    if (heapCosts[parent] <= heapCosts[position]) break;
    [heapNodes[parent], heapNodes[position]] = [heapNodes[position], heapNodes[parent]];
    [heapCosts[parent], heapCosts[position]] = [heapCosts[position], heapCosts[parent]];
    position = parent;
  }
}

function popHeap(heapNodes, heapCosts, size) {
  const top = { node: heapNodes[0], cost: heapCosts[0] };
  const last = size - 1;
  heapNodes[0] = heapNodes[last];
  heapCosts[0] = heapCosts[last];
  let position = 0;
  while (true) {
    const left = position * 2 + 1;
    const right = left + 1;
    let smallest = position;
    if (left < last && heapCosts[left] < heapCosts[smallest]) smallest = left;
    if (right < last && heapCosts[right] < heapCosts[smallest]) smallest = right;
    if (smallest === position) break;
    [heapNodes[smallest], heapNodes[position]] = [heapNodes[position], heapNodes[smallest]];
    [heapCosts[smallest], heapCosts[position]] = [heapCosts[position], heapCosts[smallest]];
    position = smallest;
  }
  return top;
}

function denseStore(nodeCount) {
  const cost = new Float64Array(nodeCount).fill(Infinity);
  const viaEdge = new Int32Array(nodeCount).fill(-1);
  const viaForward = new Uint8Array(nodeCount);
  return {
    costOf: (node) => cost[node],
    viaOf: (node) => ({ edge: viaEdge[node], forward: viaForward[node] === 1 }),
    record(node, nodeCost, edge, forward) {
      cost[node] = nodeCost;
      viaEdge[node] = edge;
      viaForward[node] = forward ? 1 : 0;
    },
  };
}

function sparseStore() {
  const reached = new Map();
  return {
    costOf: (node) => reached.get(node)?.cost ?? Infinity,
    viaOf: (node) => reached.get(node),
    record(node, nodeCost, edge, forward) {
      reached.set(node, { cost: nodeCost, edge, forward });
    },
  };
}

export function shortestPathTree(streets, start, mode, edgeCost, { maximumCost = Infinity } = {}) {
  const outgoing = streets.outgoing[mode];
  const store = maximumCost === Infinity ? denseStore(streets.nodeLat.length) : sparseStore();
  const starts = Array.isArray(start) ? start : [{ node: start, cost: 0 }];
  const heapNodes = new Int32Array(outgoing.edges.length + starts.length);
  const heapCosts = new Float64Array(outgoing.edges.length + starts.length);
  let heapSize = 0;
  for (const { node, cost } of starts) {
    if (cost >= store.costOf(node)) continue;
    store.record(node, cost, -1, false);
    pushHeap(heapNodes, heapCosts, heapSize, node, cost);
    heapSize += 1;
  }
  while (heapSize > 0) {
    const { node, cost: reachedCost } = popHeap(heapNodes, heapCosts, heapSize);
    heapSize -= 1;
    if (reachedCost > store.costOf(node) || reachedCost > maximumCost) continue;
    for (let slot = outgoing.starts[node]; slot < outgoing.starts[node + 1]; slot++) {
      const edge = outgoing.edges[slot];
      const forward = outgoing.forward[slot] === 1;
      const nextNode = forward ? streets.edgeTo[edge] : streets.edgeFrom[edge];
      const nextCost = reachedCost + edgeCost(edge, nextNode);
      if (nextCost < store.costOf(nextNode) && nextCost <= maximumCost) {
        store.record(nextNode, nextCost, edge, forward);
        pushHeap(heapNodes, heapCosts, heapSize, nextNode, nextCost);
        heapSize += 1;
      }
    }
  }
  return { mode, costOf: store.costOf, viaOf: store.viaOf };
}

function edgeLine(streets, edge, forward) {
  const start = [streets.nodeLon[streets.edgeFrom[edge]], streets.nodeLat[streets.edgeFrom[edge]]];
  const end = [streets.nodeLon[streets.edgeTo[edge]], streets.nodeLat[streets.edgeTo[edge]]];
  const line = [start, ...streets.edgeShapes[edge], end];
  return forward ? line : line.reverse();
}

export function pathInTree(streets, tree, targetNode) {
  if (tree.costOf(targetNode) === Infinity) return null;
  const edgesFromTarget = [];
  let node = targetNode;
  for (let via = tree.viaOf(node); via.edge !== -1; via = tree.viaOf(node)) {
    edgesFromTarget.push(via);
    node = via.forward ? streets.edgeFrom[via.edge] : streets.edgeTo[via.edge];
  }
  const root = node;
  const steps = edgesFromTarget.reverse();
  const line = [[streets.nodeLon[root], streets.nodeLat[root]]];
  let miles = 0;
  for (const { edge, forward } of steps) {
    line.push(...edgeLine(streets, edge, forward).slice(1));
    miles += streets.edgeMiles[edge];
  }
  return { line, miles, cost: tree.costOf(targetNode), rootCost: tree.costOf(root), edgeCount: steps.length, edges: steps };
}

const STRAIGHT_ON_DEGREES = 25;
const GENTLE_TURN_DEGREES = 60;
const TURN_BACK_DEGREES = 150;
const SHORT_UNNAMED_MILES = 0.1;
const SHORT_JOG_MILES = 0.03;
const FOOTPATH_CLASSES = new Set(['pedestrian', 'footway', 'path', 'steps', 'track', 'cycleway']);
const SERVICE_CLASSES = new Set(['service', 'living_street']);
const RAMP_CLASSES = new Set(['motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);
const LEADING_DIRECTION = /^(north|south|east|west|n|s|e|w)\.? (?=\S+ \S)/i;
const DEGREES_PER_RADIAN = 180 / Math.PI;

function bearingDegrees([fromLon, fromLat], [toLon, toLat]) {
  const east = (toLon - fromLon) * Math.cos(fromLat / DEGREES_PER_RADIAN);
  const north = toLat - fromLat;
  return (Math.atan2(east, north) * DEGREES_PER_RADIAN + 360) % 360;
}

function samePoint([firstLon, firstLat], [secondLon, secondLat]) {
  return firstLon === secondLon && firstLat === secondLat;
}

function setOffBearing(line) {
  const next = line.find((point) => !samePoint(point, line[0])) ?? line.at(-1);
  return bearingDegrees(line[0], next);
}

function arrivalBearing(line) {
  const end = line.at(-1);
  const before = line.findLast((point) => !samePoint(point, end)) ?? line[0];
  return bearingDegrees(before, end);
}

function travelledSegments(streets, travelEdges, edgeMinutes) {
  return travelEdges.map(({ edge, forward }) => {
    const line = edgeLine(streets, edge, forward);
    return {
      name: streets.edgeNames?.[edge] ?? null,
      roadClass: streets.roadClasses[streets.edgeClass[edge]],
      miles: streets.edgeMiles[edge],
      minutes: edgeMinutes(edge, forward ? streets.edgeTo[edge] : streets.edgeFrom[edge]),
      setOff: setOffBearing(line),
      arrival: arrivalBearing(line),
      startPoint: line[0],
      endPoint: line.at(-1),
    };
  });
}

function milesOf(segments) {
  return segments.reduce((sum, segment) => sum + segment.miles, 0);
}

export function sameStreet(firstName, secondName) {
  if (firstName === secondName) return true;
  if (firstName === null || secondName === null) return false;
  return firstName.replace(LEADING_DIRECTION, '').toLowerCase() === secondName.replace(LEADING_DIRECTION, '').toLowerCase();
}

function runsOfOneStreet(runs) {
  const merged = [];
  for (const run of runs) {
    const last = merged.at(-1);
    if (last && sameStreet(last.name, run.name)) {
      last.segments.push(...run.segments);
      last.arrival = run.arrival;
    } else {
      merged.push({ ...run, segments: [...run.segments] });
    }
  }
  return merged;
}

function isPassingThrough(run) {
  const miles = milesOf(run.segments);
  return run.name === null ? miles < SHORT_UNNAMED_MILES : miles < SHORT_JOG_MILES;
}

function withPassingRunsAbsorbed(runs) {
  if (runs.length < 2) return runs;
  const kept = [];
  let carriedIntoNext = [];
  for (const run of runs) {
    const segments = [...carriedIntoNext, ...run.segments];
    carriedIntoNext = [];
    if (!isPassingThrough(run)) kept.push({ ...run, segments });
    else if (kept.length > 0) kept.at(-1).segments.push(...segments);
    else carriedIntoNext = segments;
  }
  if (carriedIntoNext.length > 0) kept.push({ name: null, segments: carriedIntoNext, setOff: carriedIntoNext[0].setOff, arrival: carriedIntoNext.at(-1).arrival });
  return runsOfOneStreet(kept);
}

function roadKindOfClass(roadClass) {
  if (FOOTPATH_CLASSES.has(roadClass)) return 'footpath';
  if (SERVICE_CLASSES.has(roadClass)) return 'service-road';
  if (RAMP_CLASSES.has(roadClass)) return 'ramp';
  return 'street';
}

function roadKindOf(segments) {
  const milesByKind = new Map();
  for (const segment of segments) {
    const kind = roadKindOfClass(segment.roadClass);
    milesByKind.set(kind, (milesByKind.get(kind) ?? 0) + segment.miles);
  }
  return [...milesByKind].reduce((longest, entry) => (entry[1] > longest[1] ? entry : longest))[0];
}

function overallBearing(segments) {
  const start = segments[0].startPoint;
  const end = segments.at(-1).endPoint;
  return samePoint(start, end) ? segments[0].setOff : bearingDegrees(start, end);
}

export function turnBetween(arrivalDegrees, setOffDegrees) {
  const change = ((setOffDegrees - arrivalDegrees + 540) % 360) - 180;
  const size = Math.abs(change);
  if (size < STRAIGHT_ON_DEGREES) return 'straight';
  const side = change > 0 ? 'right' : 'left';
  if (size < GENTLE_TURN_DEGREES) return `slight-${side}`;
  if (size <= TURN_BACK_DEGREES) return side;
  return 'u-turn';
}

const NO_CONNECTOR = Object.freeze({ miles: 0, minutes: 0 });

export function streetManeuvers(streets, travelEdges, edgeMinutes, { startConnector = NO_CONNECTOR, endConnector = NO_CONNECTOR } = {}) {
  const segments = travelledSegments(streets, travelEdges, edgeMinutes);
  const runs = withPassingRunsAbsorbed(runsOfOneStreet(segments.map((segment) => ({ name: segment.name, segments: [segment], setOff: segment.setOff, arrival: segment.arrival }))));
  const arrive = { turn: 'arrive', streetName: null, roadKind: null, headingDegrees: null, distanceMiles: 0, durationMinutes: 0 };
  if (runs.length === 0) {
    return [{ ...arrive, distanceMiles: startConnector.miles + endConnector.miles, durationMinutes: startConnector.minutes + endConnector.minutes }];
  }
  const maneuvers = runs.map((run, index) => ({
    turn: index === 0 ? 'start' : turnBetween(runs[index - 1].arrival, run.setOff),
    streetName: run.name,
    roadKind: run.name === null ? roadKindOf(run.segments) : null,
    headingDegrees: index === 0 ? overallBearing(run.segments) : null,
    distanceMiles: milesOf(run.segments),
    durationMinutes: run.segments.reduce((sum, segment) => sum + segment.minutes, 0),
  }));
  maneuvers[0].distanceMiles += startConnector.miles;
  maneuvers[0].durationMinutes += startConnector.minutes;
  maneuvers.at(-1).distanceMiles += endConnector.miles;
  maneuvers.at(-1).durationMinutes += endConnector.minutes;
  return [...maneuvers, arrive];
}

export function withStreets(transitNetwork, streetSnapshot) {
  return { ...transitNetwork, streets: decodeStreetNetwork(streetSnapshot) };
}
