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

export interface CommandTriggerLabel {
  text: string;
  /** True when nothing is chosen, so the label reads as a placeholder. */
  isPlaceholder: boolean;
}

/** What the Command picker's button shows: the chosen Command's title, "None yet", or a generic label when the Command is attached but not in the list this key can read. */
export function commandTriggerLabel(commands: { uuid: string; title: string }[], commandValue: string): CommandTriggerLabel {
  if (commandValue === NO_COMMAND_VALUE) return { text: 'None yet', isPlaceholder: true };
  const command = commands.find((candidate) => candidate.uuid === commandValue);
  return { text: command?.title ?? 'A Command is attached', isPlaceholder: false };
}

/** Moves the highlighted option up or down, wrapping at both ends; -1 means nothing is highlighted yet. */
export function nextHighlightIndex(current: number, direction: 1 | -1, optionCount: number): number {
  if (optionCount === 0) return -1;
  if (current < 0) return direction === 1 ? 0 : optionCount - 1;
  return (current + direction + optionCount) % optionCount;
}

export type LastSendTone = 'ok' | 'waiting' | 'failed';

export interface LastSendDescription {
  text: string;
  tone: LastSendTone;
  /** True when the last send did not reach the device (queued or failed), so a person should look at it. */
  isIncomplete: boolean;
}

/** "just now", "3 min ago", "2 h ago", "4 d ago". */
export function formatAgo(sinceIso: string, nowMilliseconds: number): string {
  const seconds = Math.max(0, Math.floor((nowMilliseconds - new Date(sinceIso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}

/** What to tell the person about the most recent send of the target's Command; null when it has never been sent. */
export function describeLastSend(
  run: { status_slug: 'queued' | 'sent' | 'failed'; error_message?: string; created_at: string } | null,
  nowMilliseconds: number,
): LastSendDescription | null {
  if (!run) return null;
  const ago = formatAgo(run.created_at, nowMilliseconds);
  if (run.status_slug === 'sent') return { text: `Last sent ${ago}.`, tone: 'ok', isIncomplete: false };
  if (run.status_slug === 'queued') {
    return { text: `Queued ${ago}: the device is offline, so it runs when it reconnects.`, tone: 'waiting', isIncomplete: true };
  }
  const reason = run.error_message ? ` ${run.error_message}.` : '';
  return { text: `Last send failed ${ago}.${reason}`, tone: 'failed', isIncomplete: true };
}
