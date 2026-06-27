import { Ije } from '@yoyomq/ije-core';
import { createPoweredByYoyo } from './branding';

export interface BarChartData {
  name: string;
  total: number;
}

export class IjeBarChart extends HTMLElement {
  private _data: BarChartData[] = [];
  private svgWrapper: HTMLDivElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private animId: number = 0;

  set data(val: BarChartData[]) {
    this._data = val;
    this.renderChart();
  }

  get data(): BarChartData[] {
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
            this.renderChart();
        } catch (e) {
            console.error('[Yoyo ije] Error parsing JSON in IjeBarChart', e);
        }
    }
    if (name === 'loading') {
       this.renderChart(); 
    }
  }

  connectedCallback() {
    this.style.display = 'flex';
    this.style.flexDirection = 'column';
    this.style.width = '100%';
    this.style.height = this.getAttribute('height') || '350px';
    this.style.position = 'relative';

    this.svgWrapper = document.createElement('div');
    this.svgWrapper.style.width = '100%';
    this.svgWrapper.style.flex = '1';
    this.svgWrapper.style.minHeight = '0';
    this.appendChild(this.svgWrapper);

    this.appendChild(createPoweredByYoyo());

    this.resizeObserver = new ResizeObserver(() => {
        // Debounce resize to prevent thousands of redraws
        cancelAnimationFrame(this.animId);
        this.animId = requestAnimationFrame(() => this.renderChart());
    });
    this.resizeObserver.observe(this);

    this.renderChart();
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
  }

  private renderChart() {
    if (!this.svgWrapper) return;
    
    if (this._data.length === 0 || (this.hasAttribute('loading') && this.getAttribute('loading') !== 'false')) {
      this.svgWrapper.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;padding:20px;height:100%;">
         <div style="background:rgba(255,255,255,0.05);border-radius:4px;height:16px;width:100%;animation:pulse 2s infinite;"></div>
         <div style="background:rgba(255,255,255,0.05);border-radius:4px;height:16px;width:75%;animation:pulse 2s infinite;"></div>
         <div style="background:rgba(255,255,255,0.05);border-radius:4px;height:16px;width:60%;animation:pulse 2s infinite;"></div>
      </div>`;
      return;
    }

    const { clientWidth: w, clientHeight: h } = this.svgWrapper;
    if (w === 0 || h === 0) return;

    const padX = 40;
    const padY = 30;
    const drawW = w - padX * 2;
    const drawH = h - padY * 2;

    const maxVal = Math.max(...this._data.map(d => d.total), 1);
    
    // Configurable CSS colors mapping to custom DashboardBarChart styling
    const colorFill = Ije.config?.theme?.primaryColor || '#8B5CF6';
    const topStroke = '#A78BFA';
    
    const barW = Math.min(drawW / this._data.length - 8, 100); 

    let svg = `<svg width="100%" height="100%" viewBox="0 0 ${w} ${h}">
      <defs>
        <linearGradient id="ijeBarGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${colorFill}" stop-opacity="1" />
          <stop offset="100%" stop-color="${colorFill}" stop-opacity="0" />
        </linearGradient>
      </defs>`;

    this._data.forEach((d, i) => {
      const px = padX + (drawW / this._data.length) * i + ((drawW / this._data.length) - barW) / 2;
      const barH = Math.max((d.total / maxVal) * drawH, 0);
      const py = padY + (drawH - barH);
      
      // The body gradient
      svg += `<rect x="${px}" y="${py}" width="${barW}" height="${barH}" fill="url(#ijeBarGrad)" rx="4" style="transition: all 0.3s;" />`;
      // Highlighting top border
      if (barH > 2) {
          svg += `<rect x="${px}" y="${py}" width="${barW}" height="2" fill="${topStroke}" rx="1" style="transition: all 0.3s;" />`;
      }
      
      // X-Axis Text Slice
      svg += `<text x="${px + barW/2}" y="${h - 10}" fill="#71717A" font-size="12" font-family="sans-serif" text-anchor="middle">${d.name}</text>`;
      // Lightweight tooltip equivalent
      svg += `<title>${d.name}: ${d.total}</title>`;
    });

    // Y-Axis labels
    svg += `<text x="10" y="${padY + 10}" fill="#71717A" font-size="12" font-family="sans-serif">${maxVal.toFixed(0)}</text>`;
    svg += `<text x="10" y="${h - padY}" fill="#71717A" font-size="12" font-family="sans-serif">0</text>`;

    svg += `</svg>`;
    this.svgWrapper.innerHTML = svg;
  }
}

if (typeof window !== 'undefined') {
  customElements.define('ije-bar-chart', IjeBarChart);
}
