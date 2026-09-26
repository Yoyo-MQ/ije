import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ALERT_COLOUR,
  alertPlacesToFeatureCollection,
  areasToFeatureCollection,
  northWestCorner,
  routesToFeatureCollection,
  type IjeMapPosition,
} from './overlays';

const SQUARE: IjeMapPosition[] = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 1 },
  { lat: 1, lng: 1 },
  { lat: 1, lng: 0 },
];

describe('areasToFeatureCollection', () => {
  it('closes each outline into a GeoJSON ring in [lng, lat] order', () => {
    const [feature] = areasToFeatureCollection([
      { id: 'area', outline: SQUARE, colour: '#fff', lineStyle: 'dashed' },
    ]).features;
    expect((feature.geometry as GeoJSON.Polygon).coordinates[0]).toEqual([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]);
    expect(feature.properties).toMatchObject({ overlayId: 'area', colour: '#fff', lineStyle: 'dashed' });
  });

  it('skips an outline with fewer than three corners', () => {
    expect(areasToFeatureCollection([{ id: 'a', outline: SQUARE.slice(0, 2), colour: '#fff', lineStyle: 'solid' }]).features).toEqual([]);
  });
});

describe('routesToFeatureCollection', () => {
  it('draws a route of two or more points and skips a single point', () => {
    const collection = routesToFeatureCollection([
      { id: 'route', path: SQUARE.slice(0, 2), colour: '#f00', lineStyle: 'solid' },
      { id: 'point', path: SQUARE.slice(0, 1), colour: '#f00', lineStyle: 'solid' },
    ]);
    expect(collection.features.map((feature) => feature.properties!.overlayId)).toEqual(['route']);
  });
});

describe('alertPlacesToFeatureCollection', () => {
  it('draws halos for alerts only, with a default colour when none is given', () => {
    const collection = alertPlacesToFeatureCollection([
      { id: 'fire', kind: 'alert', position: { lat: 1, lng: 2 }, label: 'Smoke' },
      { id: 'dock', kind: 'station', position: { lat: 0, lng: 0 }, label: 'Dock 1' },
    ]);
    expect(collection.features).toHaveLength(1);
    expect(collection.features[0].properties).toMatchObject({ overlayId: 'fire', colour: DEFAULT_ALERT_COLOUR });
  });
});

describe('northWestCorner', () => {
  it('picks the corner furthest north and west', () => {
    expect(northWestCorner(SQUARE)).toEqual({ lat: 1, lng: 0 });
  });
});
