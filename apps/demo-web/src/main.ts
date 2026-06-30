import { Ije } from '@yoyomq/ije-core';
import '@yoyomq/ije-ui';
import { tripData } from './data';

// ─── DOM refs ────────────────────────────────────────────────────────────────

const connectPanel  = document.getElementById('ije-connect-panel')!;
const connectBar    = document.getElementById('ije-connect-bar') as HTMLDivElement;
const connectBarLbl = document.getElementById('ije-connect-bar-label')!;
const dashboard     = document.getElementById('ije-dashboard') as HTMLDivElement;
const tokenInput    = document.getElementById('token-input') as HTMLInputElement;
const connectBtn    = document.getElementById('connect-btn') as HTMLButtonElement;
const statusEl      = document.getElementById('connect-status')!;

const tripLoadBtn         = document.getElementById('trip-load-btn') as HTMLButtonElement;
const tripMapContainer    = document.getElementById('trip-map-container') as HTMLDivElement;
const liveTrackingContent = document.getElementById('live-tracking-content') as HTMLDivElement;

let organizationId: string | null = null;
let simulationTimer: ReturnType<typeof setInterval> | null = null;
let simulationIndex = 0;

// ─── Combobox ─────────────────────────────────────────────────────────────────

interface ComboItem {
  value: string;
  label: string;
}

class Combobox {
  private wrap: HTMLElement;
  private inputEl: HTMLInputElement;
  private dropdownEl: HTMLDivElement;
  private items: ComboItem[] = [];
  private filteredItems: ComboItem[] = [];
  private selectedValue: string | null = null;
  private highlightedIndex = -1;
  private changeHandlers: Array<(value: string | null, item: ComboItem | null) => void> = [];

  constructor(container: HTMLElement, placeholder: string) {
    this.wrap = container;

    const inputRow = document.createElement('div');
    inputRow.className = 'combo-input';

    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.placeholder = placeholder;
    this.inputEl.autocomplete = 'off';
    this.inputEl.spellcheck = false;

    const arrow = document.createElement('span');
    arrow.className = 'combo-arrow';
    arrow.textContent = '▾';

    inputRow.appendChild(this.inputEl);
    inputRow.appendChild(arrow);

    this.dropdownEl = document.createElement('div');
    this.dropdownEl.className = 'combo-dropdown';

    this.wrap.appendChild(inputRow);
    this.wrap.appendChild(this.dropdownEl);

    this.inputEl.addEventListener('focus', () => this.open());
    this.inputEl.addEventListener('input', () => this.onSearch());
    this.inputEl.addEventListener('keydown', (e) => this.onKeydown(e));
    inputRow.addEventListener('mousedown', (e) => {
      if (e.target !== this.inputEl) {
        e.preventDefault();
        if (this.wrap.classList.contains('open')) this.close();
        else { this.inputEl.focus(); this.open(); }
      }
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.wrap.contains(e.target as Node)) this.close();
    });
  }

  setItems(items: ComboItem[]) {
    this.items = items;
    if (this.selectedValue !== null && !this.items.some(i => i.value === this.selectedValue)) {
      this.selectedValue = null;
      this.inputEl.value = '';
    }
    this.renderDropdown(this.items);
  }

  getValue(): string | null { return this.selectedValue; }

  getSelectedItem(): ComboItem | null {
    return this.items.find(i => i.value === this.selectedValue) ?? null;
  }

  onChange(handler: (value: string | null, item: ComboItem | null) => void) {
    this.changeHandlers.push(handler);
  }

  setDisabled(disabled: boolean) {
    if (disabled) { this.wrap.classList.add('disabled'); this.close(); }
    else this.wrap.classList.remove('disabled');
  }

  setPlaceholder(text: string) { this.inputEl.placeholder = text; }

  private open() {
    if (this.wrap.classList.contains('disabled')) return;
    this.filteredItems = this.items;
    this.renderDropdown(this.items);
    this.wrap.classList.add('open');
    this.highlightedIndex = -1;
  }

  private close() {
    this.wrap.classList.remove('open');
    const item = this.getSelectedItem();
    this.inputEl.value = item ? item.label : '';
    this.highlightedIndex = -1;
  }

  private onSearch() {
    const query = this.inputEl.value.toLowerCase();
    this.filteredItems = query ? this.items.filter(i => i.label.toLowerCase().includes(query)) : this.items;
    this.renderDropdown(this.filteredItems);
    this.highlightedIndex = -1;
    if (!this.wrap.classList.contains('open')) this.wrap.classList.add('open');
  }

  private onKeydown(e: KeyboardEvent) {
    if (!this.wrap.classList.contains('open')) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); this.open(); }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.highlightedIndex = Math.min(this.highlightedIndex + 1, this.filteredItems.length - 1);
      this.applyHighlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.highlightedIndex = Math.max(this.highlightedIndex - 1, 0);
      this.applyHighlight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.highlightedIndex >= 0 && this.filteredItems[this.highlightedIndex]) {
        this.select(this.filteredItems[this.highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      this.close();
    }
  }

  private applyHighlight() {
    const options = this.dropdownEl.querySelectorAll<HTMLDivElement>('.combo-option');
    options.forEach((opt, i) => opt.classList.toggle('highlighted', i === this.highlightedIndex));
    options[this.highlightedIndex]?.scrollIntoView({ block: 'nearest' });
  }

  private select(item: ComboItem) {
    this.selectedValue = item.value;
    this.inputEl.value = item.label;
    this.close();
    this.changeHandlers.forEach(h => h(item.value, item));
  }

  private renderDropdown(items: ComboItem[]) {
    this.dropdownEl.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'combo-empty';
      empty.textContent = 'No results';
      this.dropdownEl.appendChild(empty);
      return;
    }
    for (const item of items) {
      const opt = document.createElement('div');
      opt.className = 'combo-option' + (item.value === this.selectedValue ? ' selected' : '');
      opt.textContent = item.label;
      opt.addEventListener('mousedown', (e) => { e.preventDefault(); this.select(item); });
      this.dropdownEl.appendChild(opt);
    }
  }
}

// ─── Combobox instances ───────────────────────────────────────────────────────

const liveDeviceCombo = new Combobox(
  document.getElementById('live-device-combobox')!,
  'Connect first…',
);

const tripDeviceCombo = new Combobox(
  document.getElementById('trip-devices-combobox')!,
  'All devices',
);

const triggerCombo = new Combobox(
  document.getElementById('trip-trigger-combobox')!,
  'Connect first…',
);

liveDeviceCombo.setDisabled(true);
tripDeviceCombo.setDisabled(true);
triggerCombo.setDisabled(true);

// ─── Live tracking ────────────────────────────────────────────────────────────

document.addEventListener('ije-context-ready', (e) => {
  organizationId = (e as CustomEvent).detail?.organizationId ?? null;
});

liveDeviceCombo.onChange((deviceValue, deviceItem) => {
  if (!deviceValue || !deviceItem) return;
  stopSimulation();
  renderLiveTrackingDashboard(Number(deviceValue), deviceItem.label);
});

// ─── Simulation ───────────────────────────────────────────────────────────────

function startSimulation(deviceId: number) {
  stopSimulation();
  simulationIndex = 0;

  simulationTimer = setInterval(() => {
    if (!organizationId) return;
    const wp = tripData.waypoints[simulationIndex];
    const topic = `yoyo/${organizationId}/data/devices/${deviceId}`;
    Ije.mqtt.dispatch(topic, {
      lat:       wp.latitude,
      lng:       wp.longitude,
      speed:     wp.speed,
      altitude:  wp.altitude,
      heading:   wp.angle,
      battery:   parseFloat((100 - simulationIndex * 0.05).toFixed(2)),
      timestamp: wp.timestamp * 1000,
    });
    simulationIndex = (simulationIndex + 1) % tripData.waypoints.length;
  }, 800);
}

function stopSimulation() {
  if (simulationTimer !== null) {
    clearInterval(simulationTimer);
    simulationTimer = null;
  }
}

function renderLiveTrackingDashboard(deviceId: number, deviceName: string) {
  liveTrackingContent.innerHTML = '';

  const mapEl = document.createElement('ije-map-tracker');
  const dashboardHeader = document.createElement('div');
  dashboardHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;';
  dashboardHeader.innerHTML = `<span style="font-size:13px;font-weight:600;color:var(--yoyo-foreground);">${deviceName}</span>`;

  const simulateBtn = document.createElement('button');
  simulateBtn.textContent = '▶ Simulate';
  simulateBtn.style.cssText = 'padding:5px 14px;border-radius:6px;border:1px solid #8A2BE2;background:transparent;color:#8A2BE2;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;';
  simulateBtn.addEventListener('click', () => {
    if (simulationTimer !== null) {
      stopSimulation();
      simulateBtn.textContent = '▶ Simulate';
      simulateBtn.style.background = 'transparent';
      simulateBtn.style.color = '#8A2BE2';
    } else {
      startSimulation(deviceId);
      simulateBtn.textContent = '■ Stop';
      simulateBtn.style.background = '#8A2BE2';
      simulateBtn.style.color = '#fff';
    }
  });
  dashboardHeader.appendChild(simulateBtn);
  liveTrackingContent.appendChild(dashboardHeader);

  mapEl.setAttribute('device-id', String(deviceId));
  mapEl.setAttribute('title', `Live — ${deviceName}`);
  mapEl.setAttribute('height', '420px');
  mapEl.style.cssText = 'border-radius:8px;overflow:hidden;margin-bottom:16px;display:block;';
  liveTrackingContent.appendChild(mapEl);

  const statsGrid = document.createElement('div');
  statsGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;';

  const speedWidget = document.createElement('div');
  speedWidget.className = 'widget';
  const speedStat = document.createElement('ije-telemetry-stat');
  speedStat.setAttribute('device-id', String(deviceId));
  speedStat.setAttribute('metric', 'speed');
  speedStat.setAttribute('title', 'Speed');
  speedStat.setAttribute('unit', 'km/h');
  speedWidget.appendChild(speedStat);

  const batteryWidget = document.createElement('div');
  batteryWidget.className = 'widget';
  const batteryStat = document.createElement('ije-telemetry-stat');
  batteryStat.setAttribute('device-id', String(deviceId));
  batteryStat.setAttribute('metric', 'battery');
  batteryStat.setAttribute('title', 'Battery');
  batteryStat.setAttribute('unit', '%');
  batteryWidget.appendChild(batteryStat);

  statsGrid.appendChild(speedWidget);
  statsGrid.appendChild(batteryWidget);
  liveTrackingContent.appendChild(statsGrid);

  const chartsGrid = document.createElement('div');
  chartsGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:16px;';

  const speedChartWidget = document.createElement('div');
  speedChartWidget.className = 'widget';
  const speedChart = document.createElement('ije-telemetry-chart');
  speedChart.setAttribute('device-id', String(deviceId));
  speedChart.setAttribute('metric', 'speed');
  speedChart.setAttribute('title', 'Speed over time');
  speedChart.setAttribute('unit', 'km/h');
  speedChart.setAttribute('height', '200px');
  speedChartWidget.appendChild(speedChart);

  const batteryChartWidget = document.createElement('div');
  batteryChartWidget.className = 'widget';
  const batteryChart = document.createElement('ije-telemetry-chart');
  batteryChart.setAttribute('device-id', String(deviceId));
  batteryChart.setAttribute('metric', 'battery');
  batteryChart.setAttribute('title', 'Battery over time');
  batteryChart.setAttribute('unit', '%');
  batteryChart.setAttribute('height', '200px');
  batteryChartWidget.appendChild(batteryChart);

  chartsGrid.appendChild(speedChartWidget);
  chartsGrid.appendChild(batteryChartWidget);
  liveTrackingContent.appendChild(chartsGrid);
}

// ─── Trip Explorer ────────────────────────────────────────────────────────────

tripDeviceCombo.onChange(async (deviceValue) => {
  const deviceId = deviceValue ? Number(deviceValue) : undefined;
  await refreshTriggers(deviceId);
});

async function refreshTriggers(deviceId?: number) {
  triggerCombo.setDisabled(true);
  triggerCombo.setPlaceholder('Loading…');
  try {
    const { triggers } = await Ije.trips.listTriggers({ limit: 200, deviceId });
    triggerCombo.setItems(triggers.map(t => ({ value: String(t.id), label: t.name })));
    triggerCombo.setPlaceholder(triggers.length ? 'Search triggers…' : 'No triggers found');
  } catch {
    triggerCombo.setPlaceholder('Failed to load');
    triggerCombo.setItems([]);
  }
  triggerCombo.setDisabled(false);
}

function loadTrips() {
  const triggerId = triggerCombo.getValue();
  if (!triggerId) return;

  tripMapContainer.innerHTML = '';

  const mapEl = document.createElement('ije-map-tracker');
  mapEl.setAttribute('trip-picker', '');
  mapEl.setAttribute('trigger-id', triggerId);

  const deviceId = tripDeviceCombo.getValue();
  if (deviceId) mapEl.setAttribute('device-ids', deviceId);

  const triggerName = triggerCombo.getSelectedItem()?.label || '';
  if (triggerName) mapEl.setAttribute('trigger-name', triggerName);

  mapEl.setAttribute('height', '500px');
  mapEl.setAttribute('title', 'Trip Explorer');
  mapEl.style.cssText = 'border-radius:8px;overflow:hidden;display:block;';

  tripMapContainer.appendChild(mapEl);
}

tripLoadBtn.addEventListener('click', loadTrips);

// ─── UI helpers ───────────────────────────────────────────────────────────────

function setStatus(html: string) { statusEl.innerHTML = html; }

function showConnectedBar() {
  connectPanel.style.display = 'none';
  connectBar.style.display = 'flex';
  connectBarLbl.innerHTML = `<span class="status-dot green"></span>Connected · ${Ije.config?.apiUrl ?? 'api.yoyomq.com'}`;
}

async function revealDashboard() {
  dashboard.style.display = 'flex';
  populateAnalyticsWidgets();
  await populateDevicePickers();
}

// ─── Analytics widgets ────────────────────────────────────────────────────────

function populateAnalyticsWidgets() {
  const aggEl = document.getElementById('demo-agg') as any;
  if (aggEl) {
    aggEl.data = {
      title: 'Telemetry throughput',
      description: 'Ingested device_data rows in the last 24-hour rolling window.',
      metrics: [
        { label: 'Messages',  value: '1,452,000' },
        { label: 'Per hour',  value: '60,500' },
        { label: 'In scope',  value: '342' },
      ],
    };
  }

  const barEl = document.getElementById('demo-bar') as any;
  if (barEl) {
    barEl.data = [
      { name: 'Mon', total: 120 },
      { name: 'Tue', total: 156 },
      { name: 'Wed', total: 94  },
      { name: 'Thu', total: 204 },
      { name: 'Fri', total: 180 },
      { name: 'Sat', total: 212 },
      { name: 'Sun', total: 88  },
    ];
  }
}

// ─── Populate device pickers ──────────────────────────────────────────────────

async function populateDevicePickers() {
  liveDeviceCombo.setPlaceholder('Loading devices…');

  try {
    const { devices } = await Ije.trips.listDevices({ limit: 500 });
    const deviceItems = devices.map(d => ({
      value: String(d.device_id),
      label: d.name || d.identifier,
    }));

    liveDeviceCombo.setItems(deviceItems);
    liveDeviceCombo.setPlaceholder(devices.length ? 'Select a device…' : 'No devices found');
    liveDeviceCombo.setDisabled(false);

    tripDeviceCombo.setItems(deviceItems);
    tripDeviceCombo.setPlaceholder('All devices');
    tripDeviceCombo.setDisabled(false);
  } catch {
    liveDeviceCombo.setPlaceholder('Failed to load devices');
    tripDeviceCombo.setPlaceholder('Failed to load devices');
  }

  await refreshTriggers();
}

// ─── Connection flow ──────────────────────────────────────────────────────────

async function connect(apiKey: string) {
  connectBtn.disabled = true;
  setStatus(`<span class="status-dot pulse" style="background:#8A2BE2;"></span>Connecting…`);

  try {
    await Ije.init({
      apiKey,
      apiUrl: import.meta.env.VITE_API_URL,
      mqttUrl: import.meta.env.VITE_MQTT_URL,
      theme: { primaryColor: '#8A2BE2' },
      debug: true,
    });
  } catch (err: any) {
    setStatus(`<span class="status-dot red"></span>Connection failed: ${err?.message ?? 'unknown error'}`);
    connectBtn.disabled = false;
    return;
  }

  showConnectedBar();
  await revealDashboard();
}

window.addEventListener('beforeunload', stopSimulation);

connectBtn.addEventListener('click', () => {
  const token = tokenInput.value.trim();
  if (token) void connect(token);
});

tokenInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const token = tokenInput.value.trim();
    if (token) void connect(token);
  }
});
