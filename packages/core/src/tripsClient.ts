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

export class IjeTripsClient {
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
  async getTripPath(params: { deviceIds: number[]; startsAt: number; endsAt: number }): Promise<[number, number][]> {
    const debug = this.config?.debug;
    const pageSize = 500;
    const path: [number, number][] = [];
    const partialQueryExpression = `timestamp >= ${params.startsAt} AND timestamp <= ${params.endsAt}`;
    let totalRows = 0;
    let validCoords = 0;

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
        console.log('[Yoyo ije][TripPath] first row data sample:', page.data[0].data);
      }
      for (const point of page.data) {
        const coordinate = extractLngLat(point);
        if (coordinate) { path.push(coordinate); validCoords++; }
      }
      if (page.data.length < pageSize) break;
    }

    if (debug) {
      console.log(`[Yoyo ije][TripPath] fetched ${totalRows} rows → ${validCoords} valid coords → path length ${path.length}`, { partialQueryExpression });
    }
    return path;
  }
}

/** Reads a [lng, lat] pair from a telemetry row, tolerating common field name variants. */
function extractLngLat(point: IjeDeviceDataPoint): [number, number] | null {
  const data = point?.data ?? {};
  const lat = Number(data.lat ?? data.latitude ?? data.Lat ?? data.Latitude);
  const lng = Number(data.lng ?? data.lon ?? data.longitude ?? data.Lng ?? data.Lon ?? data.Longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lng, lat];
}
