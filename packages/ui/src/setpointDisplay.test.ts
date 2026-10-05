import { describe, expect, it } from 'vitest';
import { canSendCommand, clampSetpointValue, escapeHtml, isDraftDirty, rangeBarGeometry } from './setpointDisplay';

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
