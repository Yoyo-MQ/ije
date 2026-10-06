// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { listSetpoints, latestRun, runCommand, listCommands } = vi.hoisted(() => ({
  listSetpoints: vi.fn(),
  latestRun: vi.fn(),
  runCommand: vi.fn(),
  listCommands: vi.fn(),
}));

vi.mock('@yoyomq/ije-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@yoyomq/ije-core')>();
  return {
    ...original,
    Ije: {
      setpoints: { list: listSetpoints, save: vi.fn(), remove: vi.fn() },
      commands: { list: listCommands, latestRun, run: runCommand },
    },
  };
});

import { IjeApiError } from '@yoyomq/ije-core';
import type { IjeSetpoint } from './Setpoint';
import './Setpoint';

const COMMAND_UUID = 'command-1';

function buildResponse(stateSlug: string, commandUuid: string | null = COMMAND_UUID) {
  return {
    setpoint_fields: [{ field_key: 'setpoint', label: 'Target temperature', unit: '°C', measured_value: 21 }],
    device_field_setpoints: [
      { field_key: 'setpoint', target_value: 22, tolerance_value: 1, command_uuid: commandUuid, state_slug: stateSlug, measured: { value: 21 } },
    ],
  };
}

function buildRun(statusSlug: 'queued' | 'sent' | 'failed', errorMessage?: string) {
  return { id: 'run-1', device_id: 7, command_uuid: COMMAND_UUID, protocol_slug: 'tcp', status_slug: statusSlug, error_message: errorMessage, created_at: new Date().toISOString() };
}

async function mountElement(): Promise<{ element: IjeSetpoint; events: CustomEvent[] }> {
  return mountElementWith('Target temperature');
}

async function mountElementWith(expectedText: string): Promise<{ element: IjeSetpoint; events: CustomEvent[] }> {
  const element = document.createElement('ije-setpoint') as IjeSetpoint;
  element.setAttribute('device-id', '7');
  element.setAttribute('refresh-interval', '0');
  const events: CustomEvent[] = [];
  element.addEventListener('ije-delivery-incomplete', (event) => events.push(event as CustomEvent));
  document.body.appendChild(element);
  await vi.waitFor(() => expect(element.textContent).toContain(expectedText));
  return { element, events };
}

describe('ije-setpoint', () => {
  beforeEach(() => {
    listCommands.mockResolvedValue([]);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('tells the person the last send is queued and announces it once', async () => {
    listSetpoints.mockResolvedValue(buildResponse('applying'));
    latestRun.mockResolvedValue(buildRun('queued'));
    const { element, events } = await mountElement();

    expect(element.textContent).toContain('Queued just now: the device is offline');
    expect(events.map((event) => event.detail)).toEqual([{ deviceId: 7, fieldKey: 'setpoint', statusSlug: 'queued' }]);

    await element.refresh();
    expect(events).toHaveLength(1);
  });

  it('shows the failure reason and offers to send again when the notice has no send link', async () => {
    listSetpoints.mockResolvedValue(buildResponse('applying'));
    latestRun.mockResolvedValue(buildRun('failed', 'broker refused'));
    const { element } = await mountElement();

    expect(element.textContent).toContain('Last send failed just now. broker refused.');
    expect(element.querySelectorAll('[data-action=send]')).toHaveLength(1);
  });

  it('does not repeat the send link when the state notice already offers one', async () => {
    listSetpoints.mockResolvedValue(buildResponse('not_applied'));
    latestRun.mockResolvedValue(buildRun('failed', 'broker refused'));
    const { element } = await mountElement();

    expect(element.querySelectorAll('[data-action=send]')).toHaveLength(1);
  });

  it('shows a plain line and no event when the last send went out', async () => {
    listSetpoints.mockResolvedValue(buildResponse('applying'));
    latestRun.mockResolvedValue(buildRun('sent'));
    const { element, events } = await mountElement();

    expect(element.textContent).toContain('Last sent just now.');
    expect(element.querySelector('[data-action=send]')).toBeNull();
    expect(events).toEqual([]);
  });

  it('shows no delivery line when the Command was never sent', async () => {
    listSetpoints.mockResolvedValue(buildResponse('pending'));
    latestRun.mockResolvedValue(null);
    const { element, events } = await mountElement();

    expect(element.textContent).not.toMatch(/Last sent|Queued|Last send failed/);
    expect(events).toEqual([]);
  });

  it('leaves the line out when the API key cannot read runs', async () => {
    listSetpoints.mockResolvedValue(buildResponse('pending'));
    latestRun.mockRejectedValue(new IjeApiError(403, null, 'forbidden'));
    const { element } = await mountElement();

    expect(element.textContent).toContain('Target temperature');
    expect(element.textContent).not.toMatch(/Last sent|Queued|Last send failed/);
    expect(element.querySelector('[role=alert]')).toBeNull();
  });

  it('does not look up runs for a target without a Command', async () => {
    listSetpoints.mockResolvedValue(buildResponse('needs_command', null));
    await mountElement();

    expect(latestRun).not.toHaveBeenCalled();
  });

  it('starts a new target with the tolerance its field defaults to', async () => {
    listSetpoints.mockResolvedValue({
      setpoint_fields: [{ field_key: 'humidity_setpoint', label: 'Target humidity', unit: '%', default_tolerance: 5 }],
      device_field_setpoints: [],
    });
    const { element } = await mountElementWith('Target humidity');

    element.querySelector<HTMLButtonElement>('[data-action=add]')?.click();

    expect(element.textContent).toContain('± 5 %');
  });
});
