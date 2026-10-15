import { pointInPolygon } from '../../geo.js';

const CORNER_DIGITS = 7;

function cornerKey([lon, lat]) {
  return `${lon.toFixed(CORNER_DIGITS)},${lat.toFixed(CORNER_DIGITS)}`;
}

function signedArea(ring) {
  let twiceArea = 0;
  for (let index = 1; index < ring.length; index++) twiceArea += ring[index - 1][0] * ring[index][1] - ring[index][0] * ring[index - 1][1];
  return twiceArea / 2;
}

function boundaryEdges(cellIndices, hexGrid) {
  const edges = new Map();
  for (const cellIndex of cellIndices) {
    const corners = hexGrid.cellCorners(cellIndex);
    corners.forEach((from, corner) => {
      const to = corners[(corner + 1) % corners.length];
      const backwards = `${cornerKey(to)}>${cornerKey(from)}`;
      if (edges.has(backwards)) edges.delete(backwards);
      else edges.set(`${cornerKey(from)}>${cornerKey(to)}`, { from, to });
    });
  }
  return [...edges.values()];
}

function chainedRings(edges) {
  const leaving = new Map();
  for (const edge of edges) {
    const key = cornerKey(edge.from);
    if (!leaving.has(key)) leaving.set(key, []);
    leaving.get(key).push(edge);
  }
  const rings = [];
  for (const first of edges) {
    if (first.isUsed) continue;
    const ring = [first.from];
    let edge = first;
    while (edge && !edge.isUsed) {
      edge.isUsed = true;
      ring.push(edge.to);
      edge = leaving.get(cornerKey(edge.to)).find((next) => !next.isUsed);
    }
    if (cornerKey(ring.at(-1)) === cornerKey(ring[0])) ring[ring.length - 1] = ring[0];
    rings.push(ring);
  }
  return rings;
}

export function hexOutline(cellIndices, hexGrid) {
  const rings = chainedRings(boundaryEdges(cellIndices, hexGrid));
  const outers = rings.filter((ring) => signedArea(ring) > 0);
  const holes = rings.filter((ring) => signedArea(ring) <= 0);
  const polygons = outers.map((outer) => [outer, ...holes.filter((hole) => pointInPolygon({ lon: hole[0][0], lat: hole[0][1] }, [outer]))]);
  return { rings, polygons };
}
