import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { Ije } from '@yoyomq/ije-core';
import { createPoweredByYoyo } from './branding';

export class IjeTelemetryChart extends HTMLElement {
  private chart: uPlot | null = null;
  private deviceId: string | null = null;
  private metric: string | null = null;
  
  // uPlot fundamentally requires data as an array of arrays: [ [X values], [Y values] ]
  private xData: number[] = [];
  private yData: number[] = [];

  private headerDiv: HTMLDivElement | null = null;
  private footerDiv: HTMLElement | null = null;

  static get observedAttributes() {
    return ['device-id', 'metric', 'title', 'help-message'];
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (oldValue === newValue) return;
    if (name === 'title' || name === 'help-message' || name === 'metric') {
      this.metric = this.getAttribute('metric') || 'speed';
      this.renderHeader();
      if (this.chart && name === 'metric') {
         this.chart.series[1].label = this.metric.toUpperCase();
      }
    }
  }

  connectedCallback() {
    this.deviceId = this.getAttribute('device-id');
    this.metric = this.getAttribute('metric') || 'speed';

    this.style.display = 'flex';
    this.style.flexDirection = 'column';
    this.style.width = this.getAttribute('width') || '100%';
    this.style.height = this.getAttribute('height') || '250px';
    this.style.overflow = 'hidden';
    this.style.fontFamily = 'var(--yoyo-font, sans-serif)';

    this.renderHeader();
    this.initChart();
    const footer = createPoweredByYoyo();
    this.footerDiv = footer;
    this.appendChild(footer);

    if (this.deviceId) {
      // Subscribe specifically to the telemetry sub-topic for this device
      Ije.mqtt.subscribe(`device/${this.deviceId}/telemetry`, this.handleTelemetry);
    }
  }

  disconnectedCallback() {
    if (this.deviceId) {
      Ije.mqtt.unsubscribe(`device/${this.deviceId}/telemetry`, this.handleTelemetry);
    }
    this.chart?.destroy();
  }

  private renderHeader() {
    if (!this.headerDiv) {
      this.headerDiv = document.createElement('div');
      this.headerDiv.style.display = 'flex';
      this.headerDiv.style.justifyContent = 'space-between';
      this.headerDiv.style.alignItems = 'center';
      this.headerDiv.style.marginBottom = '8px';
      this.insertBefore(this.headerDiv, this.firstChild);
    }

    const titleAttr = this.getAttribute('title');
    const helpAttr = this.getAttribute('help-message');

    let titleText = titleAttr || `${this.metric?.toUpperCase()} History`;

    this.headerDiv.innerHTML = `
      <div style="font-weight: 600; font-size: 14px; color: var(--yoyo-foreground, inherit);">
        ${titleText}
      </div>
      ${helpAttr ? `
      <div title="${helpAttr}" style="cursor: help; color: var(--yoyo-muted, #888); font-size: 12px; background: #eee; border-radius: 4px; padding: 2px 6px;">
        ?
      </div>` : ''}
    `;
  }

  private initChart() {
    const chartWrapper = document.createElement('div');
    chartWrapper.style.flex = '1';
    chartWrapper.style.minHeight = '0';
    chartWrapper.style.overflow = 'hidden';
    this.appendChild(chartWrapper);

    const primaryColor = Ije.config?.theme?.primaryColor || '#8A2BE2';

    const buildOpts = (width: number, height: number): uPlot.Options => ({
      width,
      height,
      // uPlot's legend renders below the plot and adds height *outside* the
      // `height` we pass, so the canvas can never fit the fixed-height host —
      // the plot overflows and gets clipped to an unusable sliver. The custom
      // header already labels the series, so the legend is redundant. Disabling
      // it makes the uPlot root exactly `height`, so it fits the host cleanly.
      legend: { show: false },
      axes: [
        { grid: { show: false } },
        { grid: { stroke: 'rgba(0,0,0,0.05)' } },
      ],
      series: [
        {},
        {
          label: this.metric?.toUpperCase(),
          stroke: primaryColor,
          width: 2,
          fill: primaryColor + '20',
        },
      ],
    });

    // Observe `this` (the custom element) not chartWrapper.
    // Observing the uPlot wrapper creates a feedback loop: uPlot sets the
    // wrapper's size, ResizeObserver reads it back, and the chart grows unbounded.
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const width = Math.floor(entry.contentRect.width);
        const headerHeight = this.headerDiv?.offsetHeight ?? 0;
        const footerHeight = this.footerDiv?.offsetHeight ?? 0;
        const height = Math.max(80, Math.floor(entry.contentRect.height) - headerHeight - footerHeight);
        if (width <= 0) continue;
        if (!this.chart) {
          this.chart = new uPlot(buildOpts(width, height), [this.xData, this.yData], chartWrapper);
        } else {
          this.chart.setSize({ width, height });
        }
      }
    });
    resizeObserver.observe(this);
  }

  private handleTelemetry = (payload: Record<string, any>) => {
    if (!this.chart || !this.metric) return;
    
    // We expect payload to have the metric key, e.g., payload.speed = 45.
    // Coerce and validate: uPlot plots numbers, so a missing or non-numeric
    // value from a real feed must be dropped rather than charted as NaN.
    const value = Number(payload[this.metric]);
    if (!Number.isFinite(value)) return;

    const rawTime = Number(payload.timestamp);
    const time = Number.isFinite(rawTime) ? rawTime / 1000 : Date.now() / 1000;

    this.xData.push(time);
    this.yData.push(value);

    // Keep memory bounded to last 100 points
    if (this.xData.length > 100) {
      this.xData.shift();
      this.yData.shift();
    }

    // Imperatively append data directly to the canvas WebGL context
    this.chart.setData([this.xData, this.yData]);
  }
}

if (typeof window !== 'undefined') {
  customElements.define('ije-telemetry-chart', IjeTelemetryChart);
}
