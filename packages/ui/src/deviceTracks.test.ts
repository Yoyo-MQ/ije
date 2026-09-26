import { describe, expect, it } from 'vitest';
import type { IjeTelemetryPoint } from '@yoyomq/ije-core';
import {
  buildTrackFeatureCollection,
  buildTracksAtTime,
  groupTelemetryByDevice,
  isTrailResetJump,
  latestPointAtOrBefore,
  parseDeviceIdList,
  readCoordinate,
  readHeadingDegrees,
  type DeviceTrack,
  type IjeMapTrackerDeviceAppearance,
} from './deviceTracks';

function point(deviceId: number, timestampMs: number, lng: number, lat: number): IjeTelemetryPoint {
  return { deviceId, timestampMs, lng, lat, speedKmh: null };
}

describe('parseDeviceIdList', () => {
  it('reads a comma separated list, trimming spaces and dropping blanks and repeats', () => {
    expect(parseDeviceIdList(' 12, 15,,12 ,')).toEqual(['12', '15']);
  });

  it('reads a single id the same way', () => {
    expect(parseDeviceIdList('7')).toEqual(['7']);
  });

  it('reads a missing attribute as no devices', () => {
    expect(parseDeviceIdList(null)).toEqual([]);
  });
});

describe('groupTelemetryByDevice', () => {
  it('splits a merged window into one list per device, keeping the order it came in', () => {
    const merged = [point(1, 100, 0, 0), point(2, 150, 5, 5), point(1, 200, 1, 1)];
    const grouped = groupTelemetryByDevice(merged);
    expect([...grouped.keys()]).toEqual(['1', '2']);
    expect(grouped.get('1')!.map((each) => each.timestampMs)).toEqual([100, 200]);
    expect(grouped.get('2')!.map((each) => each.timestampMs)).toEqual([150]);
  });
});

describe('latestPointAtOrBefore', () => {
  const points = [point(1, 100, 0, 0), point(1, 200, 1, 1), point(1, 300, 2, 2)];

  it('returns the last point at or before the moment', () => {
    expect(latestPointAtOrBefore(points, 250)?.timestampMs).toBe(200);
    expect(latestPointAtOrBefore(points, 200)?.timestampMs).toBe(200);
    expect(latestPointAtOrBefore(points, 999)?.timestampMs).toBe(300);
  });

  it('returns null before the device first reported', () => {
    expect(latestPointAtOrBefore(points, 99)).toBeNull();
    expect(latestPointAtOrBefore([], 100)).toBeNull();
  });
});

describe('buildTracksAtTime', () => {
  const grouped = groupTelemetryByDevice([
    point(1, 100, 0, 0),
    point(2, 150, 5, 5),
    point(1, 200, 1, 1),
    point(2, 250, 6, 6),
  ]);

  it('keeps every full route while placing each marker where its device was at that moment', () => {
    const tracks = buildTracksAtTime(grouped, 200);
    const first = tracks.find((track) => track.deviceId === '1')!;
    const second = tracks.find((track) => track.deviceId === '2')!;
    expect(first.trail).toEqual([[0, 0], [1, 1]]);
    expect(first.currentCoordinate).toEqual([1, 1]);
    expect(second.trail).toEqual([[5, 5], [6, 6]]);
    expect(second.currentCoordinate).toEqual([5, 5]);
  });

  it('hides the marker of a device that had not reported yet', () => {
    const tracks = buildTracksAtTime(grouped, 120);
    expect(tracks.find((track) => track.deviceId === '2')!.currentCoordinate).toBeNull();
    expect(tracks.find((track) => track.deviceId === '2')!.trail).toHaveLength(2);
  });
});

describe('buildTrackFeatureCollection', () => {
  const track: DeviceTrack = {
    deviceId: '1',
    trail: [[0, 0], [1, 1]],
    startCoordinate: [0, 0],
    currentCoordinate: [1, 1],
    headingDegrees: 90,
  };
  const noAppearances = new Map<string, IjeMapTrackerDeviceAppearance>();

  it('tags every feature with its device and carries the heading on the current marker', () => {
    const collection = buildTrackFeatureCollection([track], noAppearances, true);
    expect(collection.features.map((feature) => feature.properties!.markerType ?? 'trail')).toEqual([
      'trail',
      'start',
      'current',
    ]);
    expect(collection.features.every((feature) => feature.properties!.deviceId === '1')).toBe(true);
    expect(collection.features[2].properties!.heading).toBe(90);
  });

  it('leaves out start markers when asked, as a fleet map does', () => {
    const collection = buildTrackFeatureCollection([track], noAppearances, false);
    expect(collection.features.some((feature) => feature.properties!.markerType === 'start')).toBe(false);
  });

  it("carries a device's own colour, and no colour property when it has none", () => {
    const appearances = new Map([['1', { deviceId: 1, colour: '#ff0000' }]]);
    expect(buildTrackFeatureCollection([track], appearances, false).features[0].properties!.colour).toBe('#ff0000');
    expect(buildTrackFeatureCollection([track], noAppearances, false).features[0].properties).not.toHaveProperty('colour');
  });

  it('puts emphasis on the current marker only, and leaves it off for none', () => {
    const selected = new Map([['1', { deviceId: 1, emphasis: 'selected' as const }]]);
    const features = buildTrackFeatureCollection([track], selected, false).features;
    expect(features.find((feature) => feature.properties!.markerType === 'current')!.properties!.emphasis).toBe('selected');
    expect(features[0].properties).not.toHaveProperty('emphasis');
    const none = new Map([['1', { deviceId: 1, emphasis: 'none' as const }]]);
    expect(buildTrackFeatureCollection([track], none, false).features[1].properties).not.toHaveProperty('emphasis');
  });

  it('draws no current marker for a device with no position at that moment', () => {
    const collection = buildTrackFeatureCollection([{ ...track, currentCoordinate: null }], noAppearances, false);
    expect(collection.features.some((feature) => feature.properties!.markerType === 'current')).toBe(false);
  });
});

describe('isTrailResetJump', () => {
  it('treats about 200 m or more in one message as a jump, and less as movement', () => {
    expect(isTrailResetJump([0, 0], [0.0021, 0])).toBe(true);
    expect(isTrailResetJump([0, 0], [0.001, 0.001])).toBe(false);
  });
});

describe('readCoordinate', () => {
  it('accepts the common field name variants', () => {
    expect(readCoordinate({ lat: 1, lng: 2 })).toEqual([2, 1]);
    expect(readCoordinate({ Latitude: '1.5', Longitude: '2.5' })).toEqual([2.5, 1.5]);
  });

  it('rejects missing, non-numeric and out of range coordinates', () => {
    expect(readCoordinate({ lat: 1 })).toBeNull();
    expect(readCoordinate({ lat: 'north', lng: 2 })).toBeNull();
    expect(readCoordinate({ lat: 91, lng: 2 })).toBeNull();
  });
});

describe('readHeadingDegrees', () => {
  it('reads the first heading field present, and null when there is none', () => {
    expect(readHeadingDegrees({ course: 45 })).toBe(45);
    expect(readHeadingDegrees({ speed: 3 })).toBeNull();
  });
});
