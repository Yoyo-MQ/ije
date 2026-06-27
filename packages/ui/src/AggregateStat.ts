import { Ije } from '@yoyomq/ije-core';
import { createPoweredByYoyo } from './branding';

export interface AggregateMetric {
  label: string;
  value: string | number;
}

export interface AggregateData {
  title: string;
  description?: string;
  metrics: AggregateMetric[];
}

export class IjeAggregateStat extends HTMLElement {
  private _data: AggregateData | null = null;
  private container: HTMLDivElement | null = null;

  set data(val: AggregateData) {
    this._data = val;
    this.render();
  }

  get data(): AggregateData | null {
    return this._data;
  }

  static get observedAttributes() {
    return ['data-json', 'loading'];
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (oldValue === newValue) return;
    if (name === 'data-json' && newValue) {
        try {
            this._data = JSON.parse(newValue);
            this.render(); // Re-render when JSON updates
        } catch (e) {
            console.error('[Yoyo ije] Error parsing data-json in IjeAggregateStat', e);
        }
    }
    if (name === 'loading') {
        this.render();
    }
  }

  connectedCallback() {
    this.style.display = 'block';
    this.style.width = '100%';
    this.style.fontFamily = 'var(--yoyo-font, sans-serif)';
    this.render();
    // Appended once as a sibling of the container; render() only rewrites the
    // container's innerHTML, so the footer survives data updates.
    this.appendChild(createPoweredByYoyo());
  }

  private render() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.style.display = 'flex';
      this.container.style.flexDirection = 'column';
      this.appendChild(this.container);
    }

    const isLoading = this.hasAttribute('loading') && this.getAttribute('loading') !== 'false';

    const title = this._data?.title || 'Metric';
    const description = this._data?.description || '';
    const primaryStr = Ije.config?.theme?.primaryColor || '#8A2BE2';

    // Using raw CSS mapped to exactly mirror the Tailwind design structure
    this.container.innerHTML = `
      <div style="display: flex; align-items: flex-start; gap: 12px;">
        <div style="display: flex; height: 36px; width: 36px; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 8px; background: rgba(138, 43, 226, 0.15); color: ${primaryStr};">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
          </svg>
        </div>
        <div style="min-width: 0; flex: 1;">
          <h2 style="font-size: 14px; font-weight: 600; margin: 0; color: var(--yoyo-foreground, inherit);">${title}</h2>
          <p style="margin-top: 4px; font-size: 12px; line-height: 1.5; color: var(--yoyo-muted, #888); margin-bottom: 0;">${description}</p>
        </div>
      </div>
      <div style="margin-top: 16px; display: grid; min-width: 0; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px;">
        ${(this._data?.metrics || []).map(m => `
          <div style="min-width: 0; text-align: left;">
            <p style="font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; margin: 0; color: var(--yoyo-muted, #888);">${m.label}</p>
            <p style="margin-top: 2px; font-size: 16px; font-weight: 600; margin-bottom: 0; color: var(--yoyo-foreground, inherit); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; ${isLoading ? 'opacity: 0.5;' : ''}">
              ${isLoading ? '—' : m.value}
            </p>
          </div>
        `).join('')}
      </div>
    `;
  }
}

if (typeof window !== 'undefined') {
  customElements.define('ije-aggregate-stat', IjeAggregateStat);
}
