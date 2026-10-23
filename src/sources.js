import { param } from './method.js';

const SQUARE_METRES_PER_SQUARE_MILE = 1609.344 * 1609.344;
const MONTGOMERY_COUNTY_FIPS = '113';
const ROUTE_VARIANT_PATTERN = /^(.+?)-?(Sel|N&S|WKDY)$/i;

function cleanText(value) {
  const trimmed = typeof value === 'string' ? value.trim() : value ?? null;
  return trimmed || null;
}

const WORD_START_PATTERN = /(^|[\s\-/(&])([a-z])/g;

function titleCase(value) {
  const cleaned = cleanText(value);
  if (cleaned === null) return null;
  return cleaned.toLowerCase().replace(WORD_START_PATTERN, (whole, before, firstLetter) => `${before}${firstLetter.toUpperCase()}`);
}

function titleCaseIfShouting(value) {
  const cleaned = cleanText(value);
  if (cleaned === null) return null;
  return cleaned === cleaned.toUpperCase() && /[A-Z]/.test(cleaned) ? titleCase(cleaned) : cleaned;
}

function pointOf(feature) {
  const [lon, lat] = feature.geometry.coordinates;
  return { lon, lat };
}

function positiveOrNull(value) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function linePartsOf(geometry) {
  if (!geometry) return [];
  const parts = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  return parts.filter((lonLatLine) => lonLatLine.length >= 2);
}

function addressOf(street, city) {
  if (!street) return city;
  if (!city || street.toLowerCase().includes(city.toLowerCase())) return street;
  return `${street}, ${city}`;
}

export function snapshotId(layer) {
  return `${layer.service}@${layer.fetched_at.slice(0, 10)}#${layer.sha256.slice(0, 8)}`;
}

export function routeName(rawName) {
  const cleanedName = cleanText(rawName);
  const variant = cleanedName.match(ROUTE_VARIANT_PATTERN);
  const baseName = variant ? variant[1] : cleanedName;
  return baseName.replace(/^0+(?=\d)/, '');
}

export function normalizeRoutes(collection, method) {
  const fixedRouteTypes = param(method, 'routeTypes');
  const routesByName = new Map();
  for (const feature of collection.features) {
    const properties = feature.properties;
    if (!fixedRouteTypes.includes(properties.Type)) continue;
    const name = routeName(properties.Route_Name);
    const isVariant = ROUTE_VARIANT_PATTERN.test(cleanText(properties.Route_Name));
    const route = routesByName.get(name)
      ?? { id: name, name: `Route ${name}`, peakHeadwayMin: null, offPeakHeadwayMin: null, parts: [], sourceFeatures: [] };
    route.parts.push(...linePartsOf(feature.geometry));
    route.sourceFeatures.push(properties.OBJECTID);
    if (!isVariant) {
      route.peakHeadwayMin ??= positiveOrNull(properties.PeakHDWay);
      route.offPeakHeadwayMin ??= positiveOrNull(properties.OffPeakHDW);
    }
    routesByName.set(name, route);
  }
  return [...routesByName.values()].filter((route) => route.parts.length > 0);
}

function pantryProvider(feature) {
  const properties = feature.properties;
  return {
    id: `pantry-${properties.ObjectID}`,
    kind: 'pantry',
    name: titleCaseIfShouting(properties.USER_ORGANIZATION),
    address: addressOf(cleanText(properties.USER_STREET_ADDRESS), cleanText(properties.USER_CITY)),
    ...pointOf(feature),
    hoursText: cleanText(properties.USER_DETAILS),
    hoursCategory: cleanText(properties.USER_SCHEDULE),
    phone: cleanText(properties.USER_PHONE),
    website: cleanText(properties.USER_WEBSITE),
    eligibility: cleanText(properties.USER_NOTES),
    partner: cleanText(properties.Partner),
  };
}

function retailerProvider(feature, supermarketStoreTypes) {
  const properties = feature.properties;
  const storeType = cleanText(properties.USER_STORE_TYPE);
  return {
    id: `retailer-${properties.ObjectID}`,
    kind: supermarketStoreTypes.includes(storeType) ? 'supermarket' : 'other-retailer',
    name: titleCase(properties.USER_ESTABLISHMENT),
    address: addressOf(titleCase(properties.USER_STREET_ADDRESS), titleCase(properties.USER_CITY)),
    ...pointOf(feature),
    hoursText: null,
    storeType,
    acceptsSnap: properties.USER_ACCEPTS_SNAP === 'YES',
    acceptsWic: properties.USER_ACCEPTS_WIC === 'YES',
  };
}

export function normalizeProviders(pantries, retailers, method) {
  const supermarketStoreTypes = param(method, 'supermarketStoreTypes');
  const fromPantries = pantries.features.map(pantryProvider);
  const fromRetailers = retailers.features.map((feature) => retailerProvider(feature, supermarketStoreTypes));
  return [...fromPantries, ...fromRetailers];
}

export function normalizeBlockGroups(collection) {
  return collection.features.map((feature) => {
    const properties = feature.properties;
    const households = Number.isFinite(properties.Total_Occupied_Housing_Units) ? properties.Total_Occupied_Housing_Units : null;
    return {
      geoid: properties.GEOID,
      carlessPct: households ? properties.PercentNoVehicle : null,
      households,
      carlessHouseholds: properties.No_Vehicle,
      landAreaSqMi: properties.ALAND / SQUARE_METRES_PER_SQUARE_MILE,
      centroid: { lat: Number(properties.INTPTLAT), lon: Number(properties.INTPTLON) },
      geometry: feature.geometry,
    };
  });
}

export function normalizeLilaTracts(collection) {
  return collection.features
    .filter((feature) => feature.properties.COUNTYFP10 === MONTGOMERY_COUNTY_FIPS && Number(feature.properties.LILATracts_1And10) === 1)
    .map((feature) => ({ tract: feature.properties.GEOID10, geometry: feature.geometry }));
}

export function buildNetwork(collection, layer, method) {
  return { snapshotId: snapshotId(layer), routes: normalizeRoutes(collection, method) };
}
