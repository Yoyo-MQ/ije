import { Ije } from '@yoyomq/ije-core';
import { createPoweredByYoyo } from './branding';

export class IjeTelemetryStat extends HTMLElement {
  private deviceId: string | null = null;
  private metric: string | null = null;
  private headerDiv: HTMLDivElement | null = null;
  private valueDiv: HTMLDivElement | null = null;

  static get observedAttributes() {
    return ['device-id', 'metric', 'title', 'help-message', 'unit'];
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (oldValue === newValue) return;
    if (name === 'title' || name === 'help-message' || name === 'metric') {
      this.metric = this.getAttribute('metric');
      this.renderHeader();
    }
  }

  private liveTopic: string | null = null;

  connectedCallback() {
    this.deviceId = this.getAttribute('device-id');
    this.metric = this.getAttribute('metric');

    this.style.display = 'flex';
    this.style.flexDirection = 'column';
    this.style.width = this.getAttribute('width') || '100%';
    this.style.fontFamily = 'var(--yoyo-font, sans-serif)';

    this.renderHeader();
    this.renderValueArea();
    this.appendChild(createPoweredByYoyo());

    // Subscribe immediately if org context is already resolved, otherwise wait.
    if (this.deviceId && this.metric && Ije.config?.organizationId) {
      this.liveTopic = `yoyo/${Ije.config.organizationId}/data/devices/${this.deviceId}`;
      Ije.mqtt.subscribe(this.liveTopic, this.handleTelemetry);
    }

    document.addEventListener('ije-context-ready', this.handleContextReady as EventListener);
  }

  disconnectedCallback() {
    if (this.liveTopic) Ije.mqtt.unsubscribe(this.liveTopic, this.handleTelemetry);
    document.removeEventListener('ije-context-ready', this.handleContextReady as EventListener);
  }

  private handleContextReady = (e: Event) => {
    const { organizationId } = (e as CustomEvent).detail;
    if (!organizationId || !this.deviceId || !this.metric) return;
    const newTopic = `yoyo/${organizationId}/data/devices/${this.deviceId}`;
    if (newTopic !== this.liveTopic) {
      if (this.liveTopic) Ije.mqtt.unsubscribe(this.liveTopic, this.handleTelemetry);
      this.liveTopic = newTopic;
      Ije.mqtt.subscribe(this.liveTopic, this.handleTelemetry);
    }
  };

  private renderHeader() {
    if (!this.headerDiv) {
      this.headerDiv = document.createElement('div');
      this.headerDiv.style.display = 'flex';
      this.headerDiv.style.justifyContent = 'space-between';
      this.headerDiv.style.alignItems = 'center';
      this.insertBefore(this.headerDiv, this.firstChild);
    }

    const titleAttr = this.getAttribute('title');
    const helpAttr = this.getAttribute('help-message');
    const fallbackTitle = this.metric ? this.metric.toUpperCase() : 'Metric';

    this.headerDiv.innerHTML = `
      <div style="font-weight: 600; font-size: 14px; color: var(--yoyo-muted, #888); text-transform: uppercase; letter-spacing: 0.5px;">
        ${titleAttr || fallbackTitle}
      </div>
      ${helpAttr ? `
      <div title="${helpAttr}" style="cursor: help; color: var(--yoyo-muted, #888); font-size: 12px; background: #333; color: white; border-radius: 4px; padding: 2px 6px;">
        ?
      </div>` : ''}
    `;
  }

  private renderValueArea() {
    if (!this.valueDiv) {
      this.valueDiv = document.createElement('div');
      this.valueDiv.style.fontSize = '42px';
      this.valueDiv.style.fontWeight = '700';
      
      // Rely on CSS variables injected by IjeSDK for perfect reactivity
      this.valueDiv.style.color = 'var(--yoyo-foreground, inherit)';
      
      this.valueDiv.style.marginTop = '8px';
      this.valueDiv.innerText = '--';
      this.appendChild(this.valueDiv);
    }
  }

  private handleTelemetry = (payload: Record<string, any>) => {
    if (!this.metric || !this.valueDiv) return;
    
    if (payload[this.metric] !== undefined) {
      const val = payload[this.metric];
      const unit = this.getAttribute('unit') || '';
      
      // Direct raw DOM manipulation bypassing standard virtual DOM diffing mechanisms
      this.valueDiv.innerText = `${val}${unit ? ' ' + unit : ''}`;
    }
  }
}

if (typeof window !== 'undefined') {
  customElements.define('ije-telemetry-stat', IjeTelemetryStat);
}
