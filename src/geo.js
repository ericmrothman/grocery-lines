const EARTH_RADIUS_MI = 3958.8;
const RADIANS_PER_DEGREE = Math.PI / 180;

export function haversineMi(from, to) {
  const latitudeChange = (to.lat - from.lat) * RADIANS_PER_DEGREE;
  const longitudeChange = (to.lon - from.lon) * RADIANS_PER_DEGREE;
  const haversineOfAngle = Math.sin(latitudeChange / 2) ** 2
    + Math.cos(from.lat * RADIANS_PER_DEGREE) * Math.cos(to.lat * RADIANS_PER_DEGREE) * Math.sin(longitudeChange / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(haversineOfAngle));
}

export function offset(point, miles, compassBearingDegrees) {
  const angularDistance = miles / EARTH_RADIUS_MI;
  const bearing = compassBearingDegrees * RADIANS_PER_DEGREE;
  const startLatitude = point.lat * RADIANS_PER_DEGREE;
  const endLatitude = Math.asin(
    Math.sin(startLatitude) * Math.cos(angularDistance)
    + Math.cos(startLatitude) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const endLongitude = point.lon * RADIANS_PER_DEGREE + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(startLatitude),
    Math.cos(angularDistance) - Math.sin(startLatitude) * Math.sin(endLatitude),
  );
  return { lat: endLatitude / RADIANS_PER_DEGREE, lon: endLongitude / RADIANS_PER_DEGREE };
}

export function milesPerDegreeAt(latitude) {
  return {
    milesPerLatitudeDegree: EARTH_RADIUS_MI * RADIANS_PER_DEGREE,
    milesPerLongitudeDegree: EARTH_RADIUS_MI * RADIANS_PER_DEGREE * Math.cos(latitude * RADIANS_PER_DEGREE),
  };
}

function ringContains(point, lonLatRing) {
  let inside = false;
  for (let index = 0; index < lonLatRing.length; index++) {
    const previousIndex = index === 0 ? lonLatRing.length - 1 : index - 1;
    const [currentLon, currentLat] = lonLatRing[index];
    const [previousLon, previousLat] = lonLatRing[previousIndex];
    const edgeStraddlesLatitude = (currentLat > point.lat) !== (previousLat > point.lat);
    if (!edgeStraddlesLatitude) continue;
    const edgeLonAtPointLat = currentLon + ((point.lat - currentLat) / (previousLat - currentLat)) * (previousLon - currentLon);
    if (point.lon < edgeLonAtPointLat) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(point, lonLatRings) {
  const [outerRing, ...holes] = lonLatRings;
  return ringContains(point, outerRing) && !holes.some((hole) => ringContains(point, hole));
}

function segmentKey(start, end) {
  const startKey = `${start[0]},${start[1]}`;
  const endKey = `${end[0]},${end[1]}`;
  return startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
}

export function outerBoundarySegments(polygons) {
  const segmentsByKey = new Map();
  for (const lonLatRings of polygons) {
    for (const ring of lonLatRings) {
      for (let index = 0; index < ring.length - 1; index++) {
        const key = segmentKey(ring[index], ring[index + 1]);
        const existing = segmentsByKey.get(key);
        segmentsByKey.set(key, existing ? { ...existing, shared: true } : { segment: [ring[index], ring[index + 1]], shared: false });
      }
    }
  }
  return [...segmentsByKey.values()].filter((entry) => !entry.shared).map((entry) => entry.segment);
}
