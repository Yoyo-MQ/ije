import type { SdkConfig } from './index';
import { IjeHttpClient } from './httpClient';

/** Where a device stands against a target. */
export type IjeSetpointState = 'needs_command' | 'pending' | 'applying' | 'applied' | 'not_applied';

/** The value a field is held to: the target plus or minus the tolerance. */
export interface IjeSetpointNormalRange {
  min: number;
  max: number;
}

/** The field a setpoint steers, with the value the device last reported for it. */
export interface IjeSetpointMeasuredField {
  field_key: string;
  label: string;
  unit?: string;
  value: number | string | boolean | null;
  value_at?: string;
}

/** A saved target for one field of one device. */
export interface IjeSetpoint {
  id: string;
  device_id: number;
  field_key: string;
  target_value: number;
  tolerance_value: number;
  /** The saved Command that delivers the target; null until the Organization has one. */
  command_uuid: string | null;
  state_slug: IjeSetpointState;
  /** What the device last reported for the setpoint field itself, which is how it confirms the target. */
  reported_value: number | string | boolean | null;
  reported_at?: string;
  normal_range: IjeSetpointNormalRange;
  measured?: IjeSetpointMeasuredField;
}

/** A field of a device that can have a setpoint. */
export interface IjeSetpointField {
  field_key: string;
  label: string;
  unit?: string;
  /** The measured field this setpoint steers, such as temperature for the air temperature target. */
  measured_field?: string;
}

export interface IjeSetpointsResponse {
  device_field_setpoints: IjeSetpoint[];
  setpoint_fields: IjeSetpointField[];
}

export interface SaveSetpointParams {
  deviceId: number;
  fieldKey: string;
  targetValue: number;
  toleranceValue: number;
  /** Omit when there is no Command yet: the target is saved and shown as needing one. */
  commandUuid?: string | null;
}

/** Device targets (setpoints), over `/devices/{id}/field_setpoints`. Needs device:read to list, device:write to save or remove. */
export class IjeSetpointsClient {
  private http = new IjeHttpClient();

  _setConfig(config: SdkConfig) {
    this.http._setConfig(config);
  }

  /** The device's saved targets, each with its state, and the fields that can have one. */
  list(deviceId: number): Promise<IjeSetpointsResponse> {
    return this.http.get<IjeSetpointsResponse>(`/devices/${deviceId}/field_setpoints`);
  }

  /** Saves the target of one field, replacing the one it has. Saving sends nothing to the device. */
  save(params: SaveSetpointParams): Promise<IjeSetpoint> {
    return this.http.put<IjeSetpoint>(
      `/devices/${params.deviceId}/field_setpoints/${encodeURIComponent(params.fieldKey)}`,
      {
        target_value: params.targetValue,
        tolerance_value: params.toleranceValue,
        ...(params.commandUuid ? { command_uuid: params.commandUuid } : {}),
      },
    );
  }

  remove(deviceId: number, fieldKey: string): Promise<void> {
    return this.http.delete(`/devices/${deviceId}/field_setpoints/${encodeURIComponent(fieldKey)}`);
  }
}
