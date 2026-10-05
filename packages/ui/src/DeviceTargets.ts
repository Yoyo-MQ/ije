import { Ije, IjeApiError } from '@yoyomq/ije-core';
import type { IjeCommand, IjeSetpoint, IjeSetpointField, IjeSetpointState, IjeSetpointsResponse } from '@yoyomq/ije-core';
import { createPoweredByYoyo } from './branding';
import {
  NO_COMMAND_VALUE,
  SETPOINT_STATE_LABELS,
  SETPOINT_STATE_NOTICES,
  canSendCommand,
  clampSetpointValue,
  escapeHtml,
  formatSetpointValue,
  isDraftDirty,
  rangeBarGeometry,
  SETPOINT_STEP,
  type SetpointDraft,
} from './setpointDisplay';

const DEFAULT_TARGET = 20;
const DEFAULT_TOLERANCE = 1;
const DEFAULT_REFRESH_SECONDS = 15;

const STATE_COLORS: Record<IjeSetpointState, { color: string; background: string }> = {
  needs_command: { color: '#d97706', background: 'rgba(217, 119, 6, 0.12)' },
  pending: { color: 'var(--yoyo-muted, #888)', background: 'rgba(136, 136, 136, 0.14)' },
  applying: { color: 'var(--yoyo-primary, #8A2BE2)', background: 'rgba(138, 43, 226, 0.12)' },
  applied: { color: '#10b981', background: 'rgba(16, 185, 129, 0.12)' },
  not_applied: { color: '#ef4444', background: 'rgba(239, 68, 68, 0.12)' },
};

/** Detail of the events this element dispatches (all bubble). */
export interface IjeSetpointEventDetail {
  deviceId: number;
  fieldKey: string;
}

/**
 * `<ije-device-targets device-id="12">` — the targets of one device: for each field that can have one, the target, how far the
 * value may stray from it, the Command that delivers it, and where the device stands. Needs `device:read` to show and
 * `device:write` to change; the Command picker needs `command:read` and sending needs `command:run`.
 *
 * Attributes: `device-id` (required), `title` (heading, default "Targets"), `refresh-interval` (seconds between state
 * refreshes, default 15, 0 turns it off).
 *
 * Events: `ije-setpoint-saved`, `ije-setpoint-removed`, `ije-command-sent` (detail: `{ deviceId, fieldKey }`), and
 * `ije-create-command` (same detail), fired when the person asks to create a Command so the host can open its own flow;
 * call `refreshCommands()` once the Command exists. `ije-error` carries `{ message }`.
 */
export class IjeDeviceTargets extends HTMLElement {
  private response: IjeSetpointsResponse | null = null;
  private commands: IjeCommand[] = [];
  private commandsUnavailable = false;
  private drafts = new Map<string, SetpointDraft>();
  private addingFieldKeys = new Set<string>();
  private busyFieldKeys = new Set<string>();
  private errorMessage: string | null = null;
  private isLoading = true;
  private container: HTMLDivElement | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  static get observedAttributes() {
    return ['device-id', 'title', 'refresh-interval'];
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (oldValue === newValue || !this.isConnected) return;
    if (name === 'device-id') {
      this.response = null;
      this.drafts.clear();
      this.addingFieldKeys.clear();
      this.isLoading = true;
      this.render();
      void this.refresh();
    } else if (name === 'refresh-interval') {
      this.startRefreshTimer();
    } else {
      this.render();
    }
  }

  connectedCallback() {
    this.style.display = 'block';
    this.style.width = '100%';
    this.style.fontFamily = 'var(--yoyo-font, sans-serif)';
    this.container = document.createElement('div');
    this.container.addEventListener('click', this.handleClick);
    this.container.addEventListener('change', this.handleChange);
    this.appendChild(this.container);
    const poweredByFooter = createPoweredByYoyo();
    if (poweredByFooter) this.appendChild(poweredByFooter);
    this.render();
    void this.refresh();
    void this.refreshCommands();
    this.startRefreshTimer();
  }

  disconnectedCallback() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    this.container?.removeEventListener('click', this.handleClick);
    this.container?.removeEventListener('change', this.handleChange);
    this.container?.remove();
    this.container = null;
  }

  private get deviceId(): number | null {
    const deviceId = Number(this.getAttribute('device-id'));
    return Number.isInteger(deviceId) && deviceId > 0 ? deviceId : null;
  }

  private startRefreshTimer() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    const seconds = this.hasAttribute('refresh-interval') ? Number(this.getAttribute('refresh-interval')) : DEFAULT_REFRESH_SECONDS;
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    this.refreshTimer = setInterval(() => {
      const isBusy = this.busyFieldKeys.size > 0 || this.container?.contains(document.activeElement);
      if (!isBusy) void this.refresh();
    }, seconds * 1000);
  }

  /** Reloads the targets and where the device stands against each. */
  async refresh(): Promise<void> {
    const deviceId = this.deviceId;
    if (deviceId == null) {
      this.errorMessage = 'Set a device-id to show its targets.';
      this.isLoading = false;
      this.render();
      return;
    }
    try {
      this.response = await Ije.setpoints.list(deviceId);
      this.errorMessage = null;
    } catch (error) {
      this.errorMessage = this.describeError(error, 'Could not load the targets.');
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  /** Reloads the Commands in the picker, for a host that has just created one. */
  async refreshCommands(): Promise<void> {
    try {
      this.commands = await Ije.commands.list();
      this.commandsUnavailable = false;
    } catch (error) {
      this.commandsUnavailable = error instanceof IjeApiError && error.status === 403;
    }
    this.render();
  }

  private describeError(error: unknown, fallback: string): string {
    if (error instanceof IjeApiError && error.status === 403) return 'This API key is not allowed to do that.';
    if (error instanceof IjeApiError && error.errorMessage) return error.errorMessage;
    return fallback;
  }

  private notify(name: string, fieldKey: string) {
    const deviceId = this.deviceId;
    if (deviceId == null) return;
    this.dispatchEvent(new CustomEvent<IjeSetpointEventDetail>(name, { bubbles: true, detail: { deviceId, fieldKey } }));
  }

  private savedSetpoint(fieldKey: string): IjeSetpoint | undefined {
    return this.response?.device_field_setpoints.find((setpoint) => setpoint.field_key === fieldKey);
  }

  /** The draft being edited, or what a form for this field starts from: the saved target, or a default near the reading. */
  private draftFor(field: IjeSetpointField): SetpointDraft {
    const existing = this.drafts.get(field.field_key);
    if (existing) return existing;
    const saved = this.savedSetpoint(field.field_key);
    const reading = typeof saved?.measured?.value === 'number' ? saved.measured.value : null;
    return {
      target: saved?.target_value ?? (reading != null ? clampSetpointValue(reading, -Infinity) : DEFAULT_TARGET),
      tolerance: saved?.tolerance_value ?? DEFAULT_TOLERANCE,
      commandValue: saved?.command_uuid ?? NO_COMMAND_VALUE,
    };
  }

  /** Keeps the draft once the person edits it, so a refresh of the saved targets does not overwrite an edit in progress. */
  private editableDraftFor(field: IjeSetpointField): SetpointDraft {
    const draft = this.draftFor(field);
    this.drafts.set(field.field_key, draft);
    return draft;
  }

  private handleClick = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    const fieldKey = button?.dataset.field;
    if (!button || !fieldKey) {
      if (button?.dataset.action === 'retry') void this.refresh();
      return;
    }
    const field = this.response?.setpoint_fields.find((candidate) => candidate.field_key === fieldKey);
    if (!field) return;
    switch (button.dataset.action) {
      case 'step': {
        const draft = this.editableDraftFor(field);
        const direction = Number(button.dataset.dir);
        if (button.dataset.prop === 'target') draft.target = clampSetpointValue(draft.target + direction * SETPOINT_STEP, -Infinity);
        else draft.tolerance = clampSetpointValue(draft.tolerance + direction * SETPOINT_STEP, 0);
        this.render();
        break;
      }
      case 'add':
        this.editableDraftFor(field);
        this.addingFieldKeys.add(fieldKey);
        this.render();
        break;
      case 'cancel':
        this.addingFieldKeys.delete(fieldKey);
        this.drafts.delete(fieldKey);
        this.render();
        break;
      case 'save':
        void this.saveTarget(field);
        break;
      case 'remove':
        void this.removeTarget(field);
        break;
      case 'send':
        void this.sendCommand(field);
        break;
      case 'create-command':
        this.notify('ije-create-command', fieldKey);
        break;
    }
  };

  private handleChange = (event: Event) => {
    const select = event.target as HTMLSelectElement;
    const fieldKey = select.dataset.field;
    const field = this.response?.setpoint_fields.find((candidate) => candidate.field_key === fieldKey);
    if (!field || select.dataset.role !== 'command') return;
    this.editableDraftFor(field).commandValue = select.value;
    this.render();
  };

  private async run(fieldKey: string, action: () => Promise<void>, failure: string) {
    this.busyFieldKeys.add(fieldKey);
    this.errorMessage = null;
    this.render();
    try {
      await action();
    } catch (error) {
      this.errorMessage = this.describeError(error, failure);
      this.dispatchEvent(new CustomEvent('ije-error', { bubbles: true, detail: { message: this.errorMessage } }));
    } finally {
      this.busyFieldKeys.delete(fieldKey);
      this.render();
    }
  }

  private async saveTarget(field: IjeSetpointField) {
    const deviceId = this.deviceId;
    if (deviceId == null) return;
    const draft = this.draftFor(field);
    await this.run(field.field_key, async () => {
      await Ije.setpoints.save({
        deviceId,
        fieldKey: field.field_key,
        targetValue: draft.target,
        toleranceValue: draft.tolerance,
        commandUuid: draft.commandValue === NO_COMMAND_VALUE ? null : draft.commandValue,
      });
      this.addingFieldKeys.delete(field.field_key);
      this.drafts.delete(field.field_key);
      this.response = await Ije.setpoints.list(deviceId);
      this.notify('ije-setpoint-saved', field.field_key);
    }, 'Could not save the target.');
  }

  private async removeTarget(field: IjeSetpointField) {
    const deviceId = this.deviceId;
    if (deviceId == null) return;
    await this.run(field.field_key, async () => {
      await Ije.setpoints.remove(deviceId, field.field_key);
      this.addingFieldKeys.delete(field.field_key);
      this.drafts.delete(field.field_key);
      this.response = await Ije.setpoints.list(deviceId);
      this.notify('ije-setpoint-removed', field.field_key);
    }, 'Could not remove the target.');
  }

  private async sendCommand(field: IjeSetpointField) {
    const deviceId = this.deviceId;
    const commandUuid = this.savedSetpoint(field.field_key)?.command_uuid;
    const command = this.commands.find((candidate) => candidate.uuid === commandUuid);
    if (deviceId == null || !command) {
      this.errorMessage = 'The attached Command is not available to this API key.';
      this.render();
      return;
    }
    await this.run(field.field_key, async () => {
      await Ije.commands.run(command, [deviceId]);
      this.response = await Ije.setpoints.list(deviceId);
      this.notify('ije-command-sent', field.field_key);
    }, 'Could not send the Command.');
  }

  private renderField(field: IjeSetpointField): string {
    const saved = this.savedSetpoint(field.field_key);
    const isBusy = this.busyFieldKeys.has(field.field_key);
    const label = escapeHtml(field.label);
    const cardStyle = 'border:1px solid var(--yoyo-border, rgba(136,136,136,0.3)); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 10px;';
    if (!saved && !this.addingFieldKeys.has(field.field_key)) {
      return `
        <div style="${cardStyle} border-style: dashed;">
          <div style="display:flex; justify-content: space-between; align-items: center; gap: 8px;">
            <strong style="font-size: 14px; color: var(--yoyo-foreground, inherit);">${label}</strong>
            <span style="font-size: 12px; color: var(--yoyo-muted, #888);">No target</span>
          </div>
          ${this.button('add', field.field_key, 'Add a target', 'secondary')}
        </div>`;
    }

    const draft = this.draftFor(field);
    const unit = field.unit ? ` ${escapeHtml(field.unit)}` : '';
    const state = saved?.state_slug ?? null;
    const reading = typeof saved?.measured?.value === 'number' ? saved.measured.value : null;
    const rangeMinimum = draft.target - draft.tolerance;
    const rangeMaximum = draft.target + draft.tolerance;
    const geometry = rangeBarGeometry(rangeMinimum, rangeMaximum, reading);
    const notice = state ? SETPOINT_STATE_NOTICES[state] : null;
    const canSend = canSendCommand(state, saved?.command_uuid ?? null);
    const dirty = isDraftDirty(saved, draft);
    const commandOptions = [`<option value="${NO_COMMAND_VALUE}">None yet</option>`]
      .concat(this.commands.map((command) => `<option value="${escapeHtml(command.uuid)}"${command.uuid === draft.commandValue ? ' selected' : ''}>${escapeHtml(command.title)}</option>`))
      .join('');

    return `
      <div style="${cardStyle}">
        <div style="display:flex; justify-content: space-between; align-items: center; gap: 8px;">
          <strong style="font-size: 14px; color: var(--yoyo-foreground, inherit);">${label}</strong>
          ${state ? this.pill(state) : ''}
        </div>
        <div style="position: relative; height: 8px; border-radius: 999px; background: rgba(136,136,136,0.2);" aria-hidden="true">
          <div style="position: absolute; top: 0; bottom: 0; left: ${geometry.bandLeftPercent}%; width: ${geometry.bandWidthPercent}%; border-radius: 999px; background: rgba(16,185,129,0.4);"></div>
          ${geometry.readingPercent == null ? '' : `<div style="position: absolute; top: -3px; left: ${geometry.readingPercent}%; width: 14px; height: 14px; margin-left: -7px; border-radius: 50%; background: var(--yoyo-foreground, #222); border: 2px solid var(--yoyo-card-bg, #fff);"></div>`}
        </div>
        <div style="display:flex; justify-content: space-between; font-size: 12px; color: var(--yoyo-muted, #888); font-variant-numeric: tabular-nums;">
          <span>${formatSetpointValue(rangeMinimum)}${unit}</span>
          <span>${reading == null ? 'no reading yet' : `now ${formatSetpointValue(reading)}${unit}`}</span>
          <span>${formatSetpointValue(rangeMaximum)}${unit}</span>
        </div>
        <div style="display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px;">
          ${this.stepper('Target', field.field_key, 'target', `${formatSetpointValue(draft.target)}${unit}`, isBusy)}
          ${this.stepper('May stray by', field.field_key, 'tolerance', `± ${formatSetpointValue(draft.tolerance)}${unit}`, isBusy)}
        </div>
        <label style="display:flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--yoyo-muted, #888);">
          Command that delivers it
          <select data-role="command" data-field="${escapeHtml(field.field_key)}" ${isBusy ? 'disabled' : ''} style="height: 36px; border: 1px solid var(--yoyo-border, rgba(136,136,136,0.4)); border-radius: 8px; padding: 0 8px; background: var(--yoyo-card-bg, transparent); color: var(--yoyo-foreground, inherit); font: inherit;">${commandOptions}</select>
        </label>
        ${this.commandsUnavailable ? '<p style="margin:0; font-size: 12px; color: var(--yoyo-muted, #888);">This API key cannot list Commands.</p>' : ''}
        ${draft.commandValue === NO_COMMAND_VALUE && state !== 'needs_command' ? '<p style="margin:0; font-size: 12px; color: var(--yoyo-muted, #888);">Without a Command the target is saved but cannot reach the device.</p>' : ''}
        ${notice && state ? this.notice(state, notice, field.field_key, canSend, isBusy) : ''}
        <div style="display:flex; justify-content: flex-end; gap: 8px;">
          ${saved ? this.button('remove', field.field_key, 'Remove target', 'quiet', isBusy) : this.button('cancel', field.field_key, 'Cancel', 'quiet', isBusy)}
          ${this.button('save', field.field_key, isBusy ? 'Working…' : 'Save target', 'primary', isBusy || !dirty)}
        </div>
      </div>`;
  }

  private pill(state: IjeSetpointState): string {
    const { color, background } = STATE_COLORS[state];
    const outline = state === 'needs_command' ? 'outline: 1px dashed rgba(217,119,6,0.5); outline-offset: -1px;' : '';
    return `<span style="display:inline-flex; align-items:center; gap: 6px; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 500; white-space: nowrap; color: ${color}; background: ${background}; ${outline}"><span style="width:6px; height:6px; border-radius:50%; background: currentColor;"></span>${SETPOINT_STATE_LABELS[state]}</span>`;
  }

  private notice(state: IjeSetpointState, notice: { text: string; action: 'create_command' | 'send' | null }, fieldKey: string, canSend: boolean, isBusy: boolean): string {
    const { background } = STATE_COLORS[state];
    let action = '';
    if (notice.action === 'create_command') action = this.link('create-command', fieldKey, 'Create a Command');
    else if (notice.action === 'send' && canSend && !isBusy) action = this.link('send', fieldKey, state === 'not_applied' ? 'Send it again' : 'Send it now');
    return `<div style="display:flex; flex-direction: column; gap: 6px; border-radius: 8px; padding: 8px 12px; font-size: 13px; color: var(--yoyo-foreground, inherit); background: ${background};"><span>${notice.text}</span>${action}</div>`;
  }

  private stepper(label: string, fieldKey: string, prop: 'target' | 'tolerance', valueText: string, disabled: boolean): string {
    const buttonStyle = 'width: 34px; height: 36px; border: 0; background: rgba(136,136,136,0.15); color: var(--yoyo-foreground, inherit); font-size: 16px; cursor: pointer;';
    const field = escapeHtml(fieldKey);
    return `
      <div style="display:flex; flex-direction: column; gap: 6px; min-width: 0;">
        <span style="font-size: 12px; color: var(--yoyo-muted, #888);">${label}</span>
        <div style="display:flex; align-items:center; border: 1px solid var(--yoyo-border, rgba(136,136,136,0.4)); border-radius: 8px; overflow: hidden;">
          <button type="button" aria-label="Lower ${label.toLowerCase()}" data-action="step" data-prop="${prop}" data-dir="-1" data-field="${field}" ${disabled ? 'disabled' : ''} style="${buttonStyle}">−</button>
          <output style="flex:1; text-align:center; font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; color: var(--yoyo-foreground, inherit);">${valueText}</output>
          <button type="button" aria-label="Raise ${label.toLowerCase()}" data-action="step" data-prop="${prop}" data-dir="1" data-field="${field}" ${disabled ? 'disabled' : ''} style="${buttonStyle}">+</button>
        </div>
      </div>`;
  }

  private button(action: string, fieldKey: string, text: string, kind: 'primary' | 'secondary' | 'quiet', disabled = false): string {
    const styles: Record<string, string> = {
      primary: 'background: var(--yoyo-primary, #8A2BE2); color: #fff; border: 1px solid var(--yoyo-primary, #8A2BE2);',
      secondary: 'background: transparent; color: var(--yoyo-foreground, inherit); border: 1px solid var(--yoyo-border, rgba(136,136,136,0.4));',
      quiet: 'background: transparent; color: var(--yoyo-muted, #888); border: 1px solid transparent;',
    };
    return `<button type="button" data-action="${action}" data-field="${escapeHtml(fieldKey)}" ${disabled ? 'disabled' : ''} style="font: inherit; font-size: 13px; font-weight: 500; border-radius: 8px; padding: 6px 14px; cursor: ${disabled ? 'not-allowed' : 'pointer'}; opacity: ${disabled ? 0.55 : 1}; ${styles[kind]}">${text}</button>`;
  }

  private link(action: string, fieldKey: string, text: string): string {
    return `<button type="button" data-action="${action}" data-field="${escapeHtml(fieldKey)}" style="font: inherit; font-size: 13px; font-weight: 500; background: none; border: 0; padding: 0; text-align: left; cursor: pointer; color: var(--yoyo-primary, #8A2BE2);">${text}</button>`;
  }

  private render() {
    if (!this.container) return;
    const title = escapeHtml(this.getAttribute('title') || 'Targets');
    const fields = this.response?.setpoint_fields ?? [];
    let body: string;
    if (this.isLoading && !this.response) {
      body = '<p style="margin:0; font-size: 13px; color: var(--yoyo-muted, #888);">Loading targets…</p>';
    } else if (!this.response) {
      body = `<p style="margin:0; font-size: 13px; color: #ef4444;">${escapeHtml(this.errorMessage ?? 'Could not load the targets.')}</p><button type="button" data-action="retry" style="margin-top: 8px; font: inherit; font-size: 13px; cursor: pointer;">Try again</button>`;
    } else if (fields.length === 0) {
      body = '<p style="margin:0; font-size: 13px; color: var(--yoyo-muted, #888);">This device has no fields that can have a target.</p>';
    } else {
      body = fields.map((field) => this.renderField(field)).join('');
    }
    const errorBanner = this.errorMessage && this.response
      ? `<p role="alert" style="margin:0; font-size: 13px; color: #ef4444;">${escapeHtml(this.errorMessage)}</p>`
      : '';
    this.container.style.cssText = 'display:flex; flex-direction: column; gap: 12px;';
    this.container.innerHTML = `
      <span style="font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--yoyo-muted, #888);">${title}</span>
      ${errorBanner}
      ${body}`;
  }
}

if (typeof window !== 'undefined' && !customElements.get('ije-device-targets')) {
  customElements.define('ije-device-targets', IjeDeviceTargets);
}
