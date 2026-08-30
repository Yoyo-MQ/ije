import type { SdkConfig } from './index';
import { IjeHttpClient } from './httpClient';

/** A user-created Trigger and what it aggregates (public view). */
export interface IjeTrigger {
  id: number;
  uuid: string;
  name: string;
  status: boolean;
  events: string[];
  aggregators: { key: string; data_key: string | null }[];
  created_at: string;
  updated_at: string;
}

/** A Device the API key's Organization owns (only the fields the SDK relies on are typed). */
export interface IjeDevice {
  device_id: number;
  name: string;
  identifier: string;
  [key: string]: unknown;
}

/** Lightweight aggregated-event list item: identity + window + whether it carries a route. */
export interface IjeAggregatedEvent {
  id: number;
  event_group_id: number;
  device_id: number;
  trigger_id: number;
  msg_start_time: string;
  msg_end_time: string;
  has_route: boolean;
}

/** One aggregated event with its full message_content. */
export interface IjeAggregatedEventDetail {
  id: number;
  event_group_id: number;
  device_id: number;
  trigger_id: number;
  msg_start_time: string;
  msg_end_time: string;
  message_content: Record<string, unknown>;
}

/** One raw telemetry row. `data` holds the device payload (lat/lng live here). */
export interface IjeDeviceDataPoint {
  id: number;
  device_id: number;
  message_timestamp: string;
  server_timestamp: string;
  data: Record<string, any>;
  created_at: string;
}

export interface IjeTriggersResponse {
  triggers: IjeTrigger[];
  total: number;
}

export interface IjeDevicesResponse {
  devices: IjeDevice[];
  total: number;
}

export interface IjeAggregatedEventsResponse {
  aggregated_events: IjeAggregatedEvent[];
  total: number;
}

export interface IjeDeviceDataResponse {
  data: IjeDeviceDataPoint[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListAggregatedEventsParams {
  triggerId: number;
  deviceIds?: number[];
  /** Window start, Unix seconds (filters msg_start_time). */
  startsAt?: number;
  /** Window end, Unix seconds (filters msg_start_time). */
  endsAt?: number;
  hasRoute?: boolean;
  sortOrder?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

export interface GetDeviceDataParams {
  deviceIds?: number[];
  /** JSONB expression for filtering the data field (e.g. "timestamp >= 1764234113000 AND timestamp <= 1764236012000"). Timestamps must be in milliseconds. */
  partialQueryExpression?: string;
  order?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

export class IjeTelemetryClient {
  private http = new IjeHttpClient();
  private config: SdkConfig | null = null;

  _setConfig(config: SdkConfig) {
    this.config = config;
    this.http._setConfig(config);
  }

  listTriggers(params: { searchText?: string; limit?: number; offset?: number; deviceId?: number } = {}): Promise<IjeTriggersResponse> {
    return this.http.get<IjeTriggersResponse>('/public/api/v1/triggers', {
      params: { searchText: params.searchText, limit: params.limit, offset: params.offset, deviceId: params.deviceId },
    });
  }

  listDevices(params: { searchText?: string; limit?: number; offset?: number } = {}): Promise<IjeDevicesResponse> {
    return this.http.get<IjeDevicesResponse>('/public/api/v1/devices', {
      params: { searchText: params.searchText, limit: params.limit, offset: params.offset },
    });
  }

  listAggregatedEvents(params: ListAggregatedEventsParams): Promise<IjeAggregatedEventsResponse> {
    return this.http.get<IjeAggregatedEventsResponse>('/public/api/v1/aggregated_events', {
      params: {
        trigger_id: params.triggerId,
        starts_at: params.startsAt,
        ends_at: params.endsAt,
        has_route: params.hasRoute,
        sort_order: params.sortOrder,
        limit: params.limit,
        offset: params.offset,
      },
      arrayParams: params.deviceIds?.length ? { 'device_ids[]': params.deviceIds } : undefined,
    });
  }

  getAggregatedEvent(id: number): Promise<IjeAggregatedEventDetail> {
    return this.http.get<IjeAggregatedEventDetail>(`/public/api/v1/aggregated_events/${id}`);
  }

  getDeviceData(params: GetDeviceDataParams): Promise<IjeDeviceDataResponse> {
    return this.http.get<IjeDeviceDataResponse>('/public/api/v1/device_data', {
      params: {
        partial_query_expression: params.partialQueryExpression,
        order: params.order,
        limit: params.limit,
        offset: params.offset,
      },
      arrayParams: params.deviceIds?.length ? { 'device_ids[]': params.deviceIds } : undefined,
    });
  }

  /**
   * Fetches all telemetry for a window by paging through device_data and returns
   * chronological [lng, lat] pairs ready for maplibre.
   * startsAt and endsAt are Unix milliseconds.
   */
  async getPath(params: { deviceIds: number[]; startsAt: number; endsAt: number }): Promise<[number, number][]> {
    const telemetry = await this.getTelemetry(params);
    return telemetry.map((point): [number, number] => [point.lng, point.lat]);
  }

  /**
   * Fetches all telemetry for a window by paging through device_data, keeping timestamp and
   * speed alongside each coordinate (for a Timeline Bar's scrubber labels) rather than just the
   * bare path getPath returns. startsAt and endsAt are Unix milliseconds.
   */
  async getTelemetry(params: { deviceIds: number[]; startsAt: number; endsAt: number }): Promise<IjeTelemetryPoint[]> {
    const debug = this.config?.debug;
    const pageSize = 500;
    const points: IjeTelemetryPoint[] = [];
    const partialQueryExpression = `timestamp >= ${params.startsAt} AND timestamp <= ${params.endsAt}`;
    let totalRows = 0;

    for (let offset = 0; ; offset += pageSize) {
      const page = await this.getDeviceData({
        deviceIds: params.deviceIds,
        partialQueryExpression,
        order: 'ASC',
        limit: pageSize,
        offset,
      });
      totalRows += page.data.length;
      if (debug && offset === 0 && page.data.length > 0) {
        console.log('[Yoyo ije][Telemetry] first row data sample:', page.data[0].data);
      }
      for (const row of page.data) {
        const point = extractTelemetryPoint(row);
        if (point) points.push(point);
      }
      if (page.data.length < pageSize) break;
    }

    if (debug) {
      console.log(`[Yoyo ije][Telemetry] fetched ${totalRows} rows → ${points.length} valid points`, { partialQueryExpression });
    }
    return points;
  }
}

/** One telemetry point: coordinate plus when it was recorded and how fast, for a Timeline
 *  Bar's scrubber labels. `speedKmh` is null when the row carries no speed field. */
export interface IjeTelemetryPoint {
  lng: number;
  lat: number;
  timestampMs: number;
  speedKmh: number | null;
}

/** Reads one telemetry point from a row, tolerating common field name variants. Drops rows with
 *  no usable coordinate or timestamp -- both are required for a Timeline Bar to place the point. */
function extractTelemetryPoint(row: IjeDeviceDataPoint): IjeTelemetryPoint | null {
  const data = row?.data ?? {};
  const lat = Number(data.lat ?? data.latitude ?? data.Lat ?? data.Latitude);
  const lng = Number(data.lng ?? data.lon ?? data.longitude ?? data.Lng ?? data.Lon ?? data.Longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const timestampMs = new Date(row.server_timestamp ?? row.message_timestamp).getTime();
  if (!Number.isFinite(timestampMs)) return null;

  const speed = Number(data.speed ?? data.Speed);
  return { lng, lat, timestampMs, speedKmh: Number.isFinite(speed) ? speed : null };
}
