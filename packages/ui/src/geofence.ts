/**
 * Geofence overlay shapes for IjeMapTracker.
 * Mirrors the platform's trigger geofence conditions: a circle (centre + radius in metres) or a
 * GeoJSON polygon ([lng, lat] order).
 */

export type IjeGeofenceCenter = { lat: number; lng: number };

export interface IjeGeofenceCircle {
  type: 'circle';
  center: IjeGeofenceCenter;
  radius_meters: number;
}

/** GeoJSON order: [lng, lat] */
export type IjeGeoJsonCoordinate = [number, number];

export interface IjeGeofencePolygon {
  type: 'polygon';
  coordinates: IjeGeoJsonCoordinate[];
}

export type IjeGeofenceShape = IjeGeofenceCircle | IjeGeofencePolygon;

/** One geofence to draw. `emphasised` renders it as the focused fence; the rest are muted. */
export interface IjeGeofenceOverlay {
  id: string | number;
  shape: IjeGeofenceShape;
  label?: string;
  emphasised?: boolean;
}

const EARTH_RADIUS_METRES = 6371008.8;
/** Enough segments that a circle reads as round at the zoom levels a fence is inspected at. */
const CIRCLE_POLYGON_SEGMENTS = 64;

/**
 * Approximates a metre-radius circle as a polygon ring.
 * MapLibre's `circle` layer sizes in screen pixels, so a real geofence has to be a polygon or it
 * would stop matching the ground as the user zooms.
 */
export function circleToPolygonRing(
  center: IjeGeofenceCenter,
  radiusMetres: number,
  segments: number = CIRCLE_POLYGON_SEGMENTS
): IjeGeoJsonCoordinate[] {
  const latitudeRadians = (center.lat * Math.PI) / 180;
  const angularRadius = radiusMetres / EARTH_RADIUS_METRES;
  const latitudeDelta = (angularRadius * 180) / Math.PI;
  // Longitude degrees shrink with latitude, so the east-west radius has to be divided by cos(lat).
  const cosLatitude = Math.cos(latitudeRadians);
  const longitudeDelta = cosLatitude === 0 ? 0 : latitudeDelta / cosLatitude;

  const ring: IjeGeoJsonCoordinate[] = [];
  for (let step = 0; step < segments; step++) {
    const angle = (step / segments) * Math.PI * 2;
    ring.push([
      center.lng + longitudeDelta * Math.cos(angle),
      center.lat + latitudeDelta * Math.sin(angle),
    ]);
  }
  ring.push(ring[0]);
  return ring;
}

/** Closes a polygon ring if the source coordinates left it open, which GeoJSON requires. */
export function closePolygonRing(coordinates: IjeGeoJsonCoordinate[]): IjeGeoJsonCoordinate[] {
  if (coordinates.length === 0) return coordinates;
  const [firstLng, firstLat] = coordinates[0];
  const [lastLng, lastLat] = coordinates[coordinates.length - 1];
  if (firstLng === lastLng && firstLat === lastLat) return coordinates;
  return [...coordinates, coordinates[0]];
}

/** Builds the GeoJSON the geofence source renders, one Polygon feature per overlay. */
export function geofencesToFeatureCollection(geofences: IjeGeofenceOverlay[]) {
  const features = geofences
    .map((geofence) => {
      const ring =
        geofence.shape.type === 'circle'
          ? circleToPolygonRing(geofence.shape.center, geofence.shape.radius_meters)
          : closePolygonRing(geofence.shape.coordinates);
      if (ring.length < 4) return null;
      return {
        type: 'Feature' as const,
        properties: {
          geofenceId: String(geofence.id),
          label: geofence.label ?? '',
          emphasis: geofence.emphasised ? 'emphasised' : 'muted',
        },
        geometry: { type: 'Polygon' as const, coordinates: [ring] },
      };
    })
    .filter((feature): feature is NonNullable<typeof feature> => feature !== null);

  return { type: 'FeatureCollection' as const, features };
}

/** Great-circle distance in metres, for testing a point against a circle fence's own radius. */
function haversineMetres(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(toLat - fromLat);
  const deltaLng = toRadians(toLng - fromLng);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Ray casting against the ring; a point exactly on an edge counts as inside. */
function isPointInRing(ring: IjeGeoJsonCoordinate[], lng: number, lat: number): boolean {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const [currentLng, currentLat] = ring[current];
    const [previousLng, previousLat] = ring[previous];
    const straddlesRay = currentLat > lat !== previousLat > lat;
    if (!straddlesRay) continue;
    const intersectionLng =
      ((previousLng - currentLng) * (lat - currentLat)) / (previousLat - currentLat) + currentLng;
    if (lng < intersectionLng) inside = !inside;
  }
  return inside;
}

/** Whether a position sits inside a fence. Circles use their true radius rather than the drawn ring. */
export function isPositionInsideGeofence(shape: IjeGeofenceShape, lng: number, lat: number): boolean {
  if (shape.type === 'circle') {
    return haversineMetres(shape.center.lat, shape.center.lng, lat, lng) <= shape.radius_meters;
  }
  return isPointInRing(closePolygonRing(shape.coordinates), lng, lat);
}

/**
 * Decides which fences to draw emphasised.
 * An explicit host choice wins -- Playback emphasises the selected trigger's fence. With no
 * explicit choice (Live mode has no trigger selected) the fences containing the device are
 * emphasised instead, so the map always answers "which fence am I in right now".
 */
export function resolveEmphasisedGeofences(
  geofences: IjeGeofenceOverlay[],
  position: { lng: number; lat: number } | null
): IjeGeofenceOverlay[] {
  if (geofences.some((geofence) => geofence.emphasised)) return geofences;
  if (!position) return geofences;
  return geofences.map((geofence) => ({
    ...geofence,
    emphasised: isPositionInsideGeofence(geofence.shape, position.lng, position.lat),
  }));
}
