const ZIP_PATTERN = /^\s*(\d{5})(?:-\d{4})?\s*$/;

export function lookUpZip(text, zipCentroids) {
  const match = ZIP_PATTERN.exec(text ?? '');
  if (!match) return { status: 'not-a-zip' };
  const zip = match[1];
  const entry = zipCentroids.zips.find((candidate) => candidate.zip === zip);
  if (!entry) return { status: 'not-in-county', zip };
  return { status: 'found', zip, point: { lat: entry.lat, lon: entry.lon, source: 'zip' } };
}
