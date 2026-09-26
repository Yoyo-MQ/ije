/**
 * Per-device track logic for IjeMapTracker, kept free of MapLibre and the DOM so it can be tested
 * on its own. A tracker follows one or more devices; each has its own trail and current position.
 */

import type { IjeTelemetryPoint } from '@yoyomq/ije-core';

export type LngLat = [number, number];

/** `selected`: a white ring and a filled label, for the device the host is showing. `warning`: an amber ring and label. */
export type IjeMapTrackerDeviceEmphasis = 'none' | 'selected' | 'warning';

/** How a host wants one device drawn. Anything left out falls back to the tracker's own marker style. */
export interface IjeMapTrackerDeviceAppearance {
  deviceId: string | number;
  /** Shown beside the marker. Without one, a multi-device map has no way to tell devices apart. */
  label?: string;
  /** Any CSS colour, for the trail and the marker. */
  colour?: string;
  emphasis?: IjeMapTrackerDeviceEmphasis;
}

/** What the map draws for one device. */
export interface DeviceTrack {
  deviceId: string;
  trail: LngLat[];
  /** Where the trail began. Kept separately because a long live trail drops its oldest points. */
  startCoordinate: LngLat | null;
  /** Null when the device has no position at the moment being shown (e.g. before its first point). */
  currentCoordinate: LngLat | null;
  headingDegrees: number | null;
}

/** Reads a device id list: `device-ids="12, 15"`, or the legacy single `device-id="12"`. */
export function parseDeviceIdList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const deviceIds = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return [...new Set(deviceIds)];
}

/**
 * A jump this large between two consecutive live positions (about 200 m in one message) is a
 * replayed or looping feed rather than movement, so the trail restarts instead of drawing a
 * straight line across the map.
 */
export const TRAIL_RESET_JUMP_DEGREES = 0.002;

export function isTrailResetJump(previous: LngLat, next: LngLat): boolean {
  return Math.hypot(previous[0] - next[0], previous[1] - next[1]) > TRAIL_RESET_JUMP_DEGREES;
}

/** Splits a chronological telemetry list into one list per device, each keeping that order. */
export function groupTelemetryByDevice(points: IjeTelemetryPoint[]): Map<string, IjeTelemetryPoint[]> {
  const pointsByDevice = new Map<string, IjeTelemetryPoint[]>();
  for (const point of points) {
    const deviceId = String(point.deviceId);
    let devicePoints = pointsByDevice.get(deviceId);
    if (!devicePoints) {
      devicePoints = [];
      pointsByDevice.set(deviceId, devicePoints);
    }
    devicePoints.push(point);
  }
  return pointsByDevice;
}

/**
 * The device's last point at or before `timestampMs`, or null if it had not reported yet.
 * `points` must be chronological. Binary search, because a timeline scrub calls this every frame
 * for every device.
 */
export function latestPointAtOrBefore(
  points: IjeTelemetryPoint[],
  timestampMs: number
): IjeTelemetryPoint | null {
  let low = 0;
  let high = points.length - 1;
  let found: IjeTelemetryPoint | null = null;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (points[middle].timestampMs <= timestampMs) {
      found = points[middle];
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/** Tracks for a recorded window, with each device's marker where it was at `timestampMs`. */
export function buildTracksAtTime(
  pointsByDevice: Map<string, IjeTelemetryPoint[]>,
  timestampMs: number
): DeviceTrack[] {
  const tracks: DeviceTrack[] = [];
  for (const [deviceId, points] of pointsByDevice) {
    if (points.length === 0) continue;
    const current = latestPointAtOrBefore(points, timestampMs);
    tracks.push({
      deviceId,
      trail: points.map((point): LngLat => [point.lng, point.lat]),
      startCoordinate: [points[0].lng, points[0].lat],
      currentCoordinate: current ? [current.lng, current.lat] : null,
      headingDegrees: null,
    });
  }
  return tracks;
}

/**
 * The GeoJSON every track layer reads. Each feature carries its `deviceId` (for clicks) and
 * `colour` (for data-driven paint). Callers draw start markers only when following one device:
 * on a fleet map a green dot per device is clutter, and the trails already show where each began.
 */
export function buildTrackFeatureCollection(
  tracks: DeviceTrack[],
  appearances: Map<string, IjeMapTrackerDeviceAppearance>,
  showsStartMarkers: boolean
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const track of tracks) {
    const appearance = appearances.get(track.deviceId);
    const colour = appearance?.colour;
    const emphasis = appearance?.emphasis ?? 'none';
    const properties = { deviceId: track.deviceId, ...(colour ? { colour } : {}) };
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: track.trail },
      properties,
    });
    if (showsStartMarkers && track.startCoordinate) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: track.startCoordinate },
        properties: { ...properties, markerType: 'start' },
      });
    }
    if (track.currentCoordinate) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: track.currentCoordinate },
        properties: {
          ...properties,
          markerType: 'current',
          ...(track.headingDegrees !== null ? { heading: track.headingDegrees } : {}),
          ...(emphasis !== 'none' ? { emphasis } : {}),
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

/** Reads a heading from the payload field names devices commonly use. Null when none is usable. */
export function readHeadingDegrees(payload: Record<string, any>): number | null {
  const heading = Number(payload?.angle ?? payload?.course ?? payload?.heading ?? payload?.bearing);
  return Number.isFinite(heading) ? heading : null;
}

/** Reads a coordinate from the payload field names devices commonly use. Null when missing or out of range. */
export function readCoordinate(payload: Record<string, any>): LngLat | null {
  const lng = Number(
    payload?.lng ?? payload?.lon ?? payload?.longitude ?? payload?.Lng ?? payload?.Lon ?? payload?.Longitude
  );
  const lat = Number(payload?.lat ?? payload?.latitude ?? payload?.Lat ?? payload?.Latitude);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  return [lng, lat];
}
