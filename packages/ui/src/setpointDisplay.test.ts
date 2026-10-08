import { describe, expect, it } from 'vitest';
import { describeLastSend, formatAgo, canSendCommand, clampSetpointValue, commandTriggerLabel, escapeHtml, isDraftDirty, nextHighlightIndex, rangeBarGeometry } from './setpointDisplay';

describe('clampSetpointValue', () => {
  it('rounds to the nearest half step', () => {
    expect(clampSetpointValue(21.74, 0)).toBe(21.5);
  });

  it('never goes below the minimum', () => {
    expect(clampSetpointValue(-0.5, 0)).toBe(0);
  });
});

describe('escapeHtml', () => {
  it('escapes markup so a field label cannot inject elements', () => {
    expect(escapeHtml('<img src=x onerror="a()">')).toBe('&lt;img src=x onerror=&quot;a()&quot;&gt;');
  });
});

describe('rangeBarGeometry', () => {
  it('puts a reading inside the band between the band edges', () => {
    const geometry = rangeBarGeometry(20, 24, 22);

    expect(geometry.readingPercent).toBeGreaterThan(geometry.bandLeftPercent);
    expect(geometry.readingPercent).toBeLessThan(geometry.bandLeftPercent + geometry.bandWidthPercent);
  });

  it('keeps a reading below the band on the bar, left of the band', () => {
    const geometry = rangeBarGeometry(20, 24, 12);

    expect(geometry.readingPercent).toBeGreaterThanOrEqual(0);
    expect(geometry.readingPercent).toBeLessThan(geometry.bandLeftPercent);
  });

  it('has no reading position without a numeric reading', () => {
    expect(rangeBarGeometry(20, 24, null).readingPercent).toBeNull();
  });
});

describe('canSendCommand', () => {
  it('offers sending when a Command is attached and the device has not confirmed the target', () => {
    expect(canSendCommand('pending', 'command-1')).toBe(true);
    expect(canSendCommand('not_applied', 'command-1')).toBe(true);
  });

  it('does not offer sending without a Command, or once the target is applied', () => {
    expect(canSendCommand('needs_command', null)).toBe(false);
    expect(canSendCommand('applied', 'command-1')).toBe(false);
  });
});

describe('isDraftDirty', () => {
  const saved = { target_value: 22, tolerance_value: 2, command_uuid: null };

  it('is clean when the draft matches the saved target', () => {
    expect(isDraftDirty(saved, { target: 22, tolerance: 2, commandValue: 'none' })).toBe(false);
  });

  it('is dirty when the Command changes', () => {
    expect(isDraftDirty(saved, { target: 22, tolerance: 2, commandValue: 'command-1' })).toBe(true);
  });

  it('is dirty for a field with nothing saved yet', () => {
    expect(isDraftDirty(undefined, { target: 20, tolerance: 1, commandValue: 'none' })).toBe(true);
  });
});

describe('commandTriggerLabel', () => {
  const commands = [{ uuid: 'c1', title: 'Set air temperature' }];

  it('shows the chosen Command by title', () => {
    expect(commandTriggerLabel(commands, 'c1')).toEqual({ text: 'Set air temperature', isPlaceholder: false });
  });

  it('shows None yet as a placeholder when no Command is chosen', () => {
    expect(commandTriggerLabel(commands, 'none')).toEqual({ text: 'None yet', isPlaceholder: true });
  });

  it('does not claim None yet for a Command this key cannot read', () => {
    expect(commandTriggerLabel([], 'c9').isPlaceholder).toBe(false);
    expect(commandTriggerLabel([], 'c9').text).toBe('A Command is attached');
  });
});

describe('nextHighlightIndex', () => {
  it('starts at the first option going down and the last going up', () => {
    expect(nextHighlightIndex(-1, 1, 3)).toBe(0);
    expect(nextHighlightIndex(-1, -1, 3)).toBe(2);
  });

  it('wraps at both ends', () => {
    expect(nextHighlightIndex(2, 1, 3)).toBe(0);
    expect(nextHighlightIndex(0, -1, 3)).toBe(2);
  });

  it('highlights nothing when there are no options', () => {
    expect(nextHighlightIndex(0, 1, 0)).toBe(-1);
  });
});

describe('formatAgo', () => {
  const now = new Date('2026-10-05T12:00:00Z').getTime();

  it('reads minutes, hours and days', () => {
    expect(formatAgo('2026-10-05T11:57:00Z', now)).toBe('3 min ago');
    expect(formatAgo('2026-10-05T10:00:00Z', now)).toBe('2 h ago');
    expect(formatAgo('2026-10-01T12:00:00Z', now)).toBe('4 d ago');
  });

  it('says just now for the last minute, even if the clocks disagree slightly', () => {
    expect(formatAgo('2026-10-05T11:59:40Z', now)).toBe('just now');
    expect(formatAgo('2026-10-05T12:00:05Z', now)).toBe('just now');
  });
});

describe('describeLastSend', () => {
  const now = new Date('2026-10-05T12:00:00Z').getTime();
  const at = '2026-10-05T11:57:00Z';

  it('says nothing for a Command that was never sent', () => {
    expect(describeLastSend(null, now)).toBeNull();
  });

  it('treats a sent run as complete', () => {
    expect(describeLastSend({ status_slug: 'sent', created_at: at }, now)).toEqual({ text: 'Last sent 3 min ago.', tone: 'ok', isIncomplete: false });
  });

  it('flags a queued run as incomplete because the device is offline', () => {
    const description = describeLastSend({ status_slug: 'queued', created_at: at }, now);

    expect(description?.isIncomplete).toBe(true);
    expect(description?.tone).toBe('waiting');
    expect(description?.text).toContain('device is offline');
  });

  it('flags a failed run as incomplete and includes the reason', () => {
    const description = describeLastSend({ status_slug: 'failed', error_message: 'no MQTT client found', created_at: at }, now);

    expect(description?.isIncomplete).toBe(true);
    expect(description?.text).toBe('Last send failed 3 min ago. no MQTT client found.');
  });
});
