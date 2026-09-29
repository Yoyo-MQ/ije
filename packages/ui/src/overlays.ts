/**
 * Host-drawn context for IjeMapTracker: the areas, routes and places a fleet works around, as
 * opposed to the devices themselves. Kept free of MapLibre and the DOM so it can be tested.
 */

/** A point on the map. Same convention as a geofence centre. */
export interface IjeMapPosition {
  lat: number;
  lng: number;
}

export type IjeMapLineStyle = 'solid' | 'dashed';

/** A region outlined and lightly filled, e.g. a survey area or a patrol perimeter. */
export interface IjeMapArea {
  id: string;
  outline: IjeMapPosition[];
  /** Any CSS colour. */
  colour: string;
  lineStyle: IjeMapLineStyle;
  /** Shown in a tag above the outline's north-west corner. */
  label?: string;
}

/** A path drawn as a line, e.g. a planned or response route. */
export interface IjeMapRoute {
  id: string;
  path: IjeMapPosition[];
  colour: string;
  lineStyle: IjeMapLineStyle;
}

/** `alert`: something needing attention, drawn with a halo. `station`: a fixed base such as a dock or depot. */
export type IjeMapPlaceKind = 'alert' | 'station' | 'waypoint';

/** Where a waypoint stands in its route: already reached, the one being flown to, or still ahead. */
export type IjeMapWaypointProgress = 'reached' | 'next' | 'upcoming';

export interface IjeMapPlace {
  id: string;
  /** `waypoint`: one numbered stop on a route, a numbered circle with its label as a quiet note. */
  kind: IjeMapPlaceKind;
  position: IjeMapPosition;
  /** A waypoint's note beside its circle, e.g. its altitude; empty for none. */
  label: string;
  /** An alert's halo and tag dot, or a waypoint's circle. Stations are drawn neutral. */
  colour?: string;
  /** Short uppercase badge after an alert's label, e.g. "Critical". */
  badge?: string;
  /** A waypoint's number in its route, shown in its circle. */
  sequenceNumber?: number;
  /** A waypoint's progress: reached ones fill, the next one grows. Defaults to upcoming. */
  progress?: IjeMapWaypointProgress;
}

export interface IjeMapOverlays {
  areas?: IjeMapArea[];
  routes?: IjeMapRoute[];
  places?: IjeMapPlace[];
}

export const DEFAULT_ALERT_COLOUR = '#EF4444';

function toLngLat(position: IjeMapPosition): [number, number] {
  return [position.lng, position.lat];
}

/** Outlines need three corners to enclose anything; shorter ones are skipped. */
export function areasToFeatureCollection(areas: IjeMapArea[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: areas
      .filter((area) => area.outline.length >= 3)
      .map((area) => ({
        type: 'Feature',
        properties: { overlayId: area.id, colour: area.colour, lineStyle: area.lineStyle },
        geometry: { type: 'Polygon', coordinates: [[...area.outline, area.outline[0]].map(toLngLat)] },
      })),
  };
}

export function routesToFeatureCollection(routes: IjeMapRoute[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: routes
      .filter((route) => route.path.length >= 2)
      .map((route) => ({
        type: 'Feature',
        properties: { overlayId: route.id, colour: route.colour, lineStyle: route.lineStyle },
        geometry: { type: 'LineString', coordinates: route.path.map(toLngLat) },
      })),
  };
}

/** Halos for alert places only; stations are HTML markers with no canvas part. */
export function alertPlacesToFeatureCollection(places: IjeMapPlace[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: places
      .filter((place) => place.kind === 'alert')
      .map((place) => ({
        type: 'Feature',
        properties: { overlayId: place.id, colour: place.colour ?? DEFAULT_ALERT_COLOUR },
        geometry: { type: 'Point', coordinates: toLngLat(place.position) },
      })),
  };
}

/** The outline corner furthest north-west, where an area's tag sits clear of the area itself. */
export function northWestCorner(outline: IjeMapPosition[]): IjeMapPosition {
  return outline.reduce((best, point) => (point.lat - point.lng > best.lat - best.lng ? point : best));
}
