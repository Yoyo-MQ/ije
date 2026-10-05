import type { IjeSetpointState } from '@yoyomq/ije-core';

export const SETPOINT_STEP = 0.5;
export const NO_COMMAND_VALUE = 'none';

export const SETPOINT_STATE_LABELS: Record<IjeSetpointState, string> = {
  needs_command: 'Needs a Command',
  pending: 'Waiting to send',
  applying: 'Applying',
  applied: 'At target',
  not_applied: 'Not reached',
};

/** What each state means for the person, and whether the next step is creating a Command or sending the one attached. */
export const SETPOINT_STATE_NOTICES: Record<IjeSetpointState, { text: string; action: 'create_command' | 'send' | null }> = {
  needs_command: { text: 'Saved, but nothing can deliver it. Add a Command that sets this target on the device.', action: 'create_command' },
  pending: { text: 'A Command is attached but has not run since you saved this target.', action: 'send' },
  applying: { text: 'Sent recently. The device has a few minutes to reach the range.', action: null },
  applied: { text: 'The reading is inside the range.', action: null },
  not_applied: { text: 'Sent, and the reading is still outside the range.', action: 'send' },
};

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Rounds to the nearest step and never goes below the minimum. */
export function clampSetpointValue(value: number, minimum: number): number {
  return Math.max(minimum, Math.round(value / SETPOINT_STEP) * SETPOINT_STEP);
}

export function formatSetpointValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export interface RangeBarGeometry {
  bandLeftPercent: number;
  bandWidthPercent: number;
  /** Where the reading sits on the bar, or null when there is no numeric reading. */
  readingPercent: number | null;
}

/** Lays the allowed range and the reading on one bar, padding the ends by half the band so a reading just outside it is still on the bar. */
export function rangeBarGeometry(rangeMinimum: number, rangeMaximum: number, reading: number | null): RangeBarGeometry {
  const bandWidth = Math.max(rangeMaximum - rangeMinimum, SETPOINT_STEP);
  const domainMinimum = Math.min(rangeMinimum, reading ?? rangeMinimum) - bandWidth / 2;
  const domainMaximum = Math.max(rangeMaximum, reading ?? rangeMaximum) + bandWidth / 2;
  const span = domainMaximum - domainMinimum;
  const toPercent = (value: number) => ((value - domainMinimum) / span) * 100;
  return {
    bandLeftPercent: toPercent(rangeMinimum),
    bandWidthPercent: toPercent(rangeMaximum) - toPercent(rangeMinimum),
    readingPercent: reading == null ? null : toPercent(reading),
  };
}

/** A person can send the attached Command when it exists and the device has not confirmed the target. */
export function canSendCommand(state: IjeSetpointState | null, commandUuid: string | null): boolean {
  return commandUuid != null && (state === 'pending' || state === 'not_applied');
}

export interface SetpointDraft {
  target: number;
  tolerance: number;
  commandValue: string;
}

export function isDraftDirty(
  saved: { target_value: number; tolerance_value: number; command_uuid: string | null } | undefined,
  draft: SetpointDraft,
): boolean {
  if (!saved) return true;
  return (
    draft.target !== saved.target_value ||
    draft.tolerance !== saved.tolerance_value ||
    draft.commandValue !== (saved.command_uuid ?? NO_COMMAND_VALUE)
  );
}
