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

const tripLoadBtn      = document.getElementById('trip-load-btn') as HTMLButtonElement;
const tripLiveBtn      = document.getElementById('trip-live-btn') as HTMLButtonElement;
const tripMapContainer = document.getElementById('trip-map-container') as HTMLDivElement;

// ─── Combobox ─────────────────────────────────────────────────────────────────

interface ComboItem {
  value: string;
  label: string;
  data?: Record<string, string>;
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
    // Re-validate selected value
    if (this.selectedValue !== null) {
      const stillExists = this.items.some(i => i.value === this.selectedValue);
      if (!stillExists) {
        this.selectedValue = null;
        this.inputEl.value = '';
      }
    }
    this.renderDropdown(this.items);
  }

  getValue(): string | null {
    return this.selectedValue;
  }

  getSelectedItem(): ComboItem | null {
    return this.items.find(i => i.value === this.selectedValue) ?? null;
  }

  onChange(handler: (value: string | null, item: ComboItem | null) => void) {
    this.changeHandlers.push(handler);
  }

  setDisabled(disabled: boolean) {
    if (disabled) {
      this.wrap.classList.add('disabled');
      this.close();
    } else {
      this.wrap.classList.remove('disabled');
    }
  }

  setPlaceholder(text: string) {
    this.inputEl.placeholder = text;
  }

  private open() {
    if (this.wrap.classList.contains('disabled')) return;
    this.filteredItems = this.items;
    this.renderDropdown(this.items);
    this.wrap.classList.add('open');
    this.highlightedIndex = -1;
  }

  private close() {
    this.wrap.classList.remove('open');
    // Restore display label of current selection
    const item = this.getSelectedItem();
    this.inputEl.value = item ? item.label : '';
    this.highlightedIndex = -1;
  }

  private onSearch() {
    const query = this.inputEl.value.toLowerCase();
    this.filteredItems = query
      ? this.items.filter(i => i.label.toLowerCase().includes(query))
      : this.items;
    this.renderDropdown(this.filteredItems);
    this.highlightedIndex = -1;
    if (!this.wrap.classList.contains('open')) {
      this.wrap.classList.add('open');
    }
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

const triggerCombo = new Combobox(
  document.getElementById('trip-trigger-combobox')!,
  'Connect first…',
);
const deviceCombo = new Combobox(
  document.getElementById('trip-devices-combobox')!,
  'All devices',
);

triggerCombo.setDisabled(true);
deviceCombo.setDisabled(true);

// When the device changes, reload the trigger list filtered to that device.
deviceCombo.onChange(async (deviceValue) => {
  const deviceId = deviceValue ? Number(deviceValue) : undefined;
  await refreshTriggers(deviceId);
});

// ─── UI helpers ──────────────────────────────────────────────────────────────

function setStatus(html: string) {
  statusEl.innerHTML = html;
}

function showConnectedBar() {
  connectPanel.style.display = 'none';
  connectBar.style.display = 'flex';
  connectBarLbl.innerHTML = `<span class="status-dot green"></span>Connected · ${Ije.config?.apiUrl ?? 'api.yoyomq.com'}`;
}

function revealDashboard() {
  dashboard.style.display = 'flex';
  populateStaticWidgets();
}

// ─── Static widget data ───────────────────────────────────────────────────────

function populateStaticWidgets() {
  const agg = document.getElementById('demo-agg');
  if (agg) {
    agg.setAttribute('data-json', JSON.stringify({
      title: 'Telemetry throughput',
      description: 'Ingested device_data rows whose message timestamp falls in the last 24-hour rolling window.',
      metrics: [
        { label: 'Messages',  value: '1,452,000' },
        { label: 'Per hour',  value: '60,500.00' },
        { label: 'In scope',  value: '342' },
      ],
    }));
  }

  const bar = document.getElementById('demo-bar');
  if (bar) {
    bar.setAttribute('data-json', JSON.stringify([
      { name: '2026-04-01', total: 120 },
      { name: '2026-04-02', total: 156 },
      { name: '2026-04-03', total: 94  },
      { name: '2026-04-04', total: 204 },
      { name: '2026-04-05', total: 180 },
      { name: '2026-04-06', total: 212 },
    ]));
  }
}

// ─── MQTT telemetry loop ──────────────────────────────────────────────────────

function startTelemetryLoop() {
  let index = 0;

  setTimeout(() => {
    setInterval(() => {
      const wp = tripData.waypoints[index];

      Ije.mqtt.dispatch('device/truck-001/location', {
        lat: wp.latitude,
        lng: wp.longitude,
      });

      Ije.mqtt.dispatch('device/truck-001/telemetry', {
        speed:     wp.speed,
        battery:   parseFloat((100 - index * 0.05).toFixed(2)),
        timestamp: wp.timestamp * 1000,
      });

      index = (index + 1) % tripData.waypoints.length;
    }, 1000);
  }, 2000);
}

// ─── Connection flow ──────────────────────────────────────────────────────────

async function connect(apiKey: string) {
  connectBtn.disabled = true;
  setStatus(`<span class="status-dot pulse" style="background:#8A2BE2;"></span>Connecting…`);

  try {
    await Ije.init({ apiKey, apiUrl: import.meta.env.VITE_API_URL, mqttUrl: import.meta.env.VITE_MQTT_URL, theme: { primaryColor: '#8A2BE2' }, debug: true });
  } catch (err: any) {
    setStatus(`<span class="status-dot red"></span>Connection failed: ${err?.message ?? 'unknown error'}`);
    connectBtn.disabled = false;
    return;
  }

  showConnectedBar();
  revealDashboard();
  // startTelemetryLoop();
  void populateTripPickers();
}

// ─── Trip Explorer ─────────────────────────────────────────────────────────────

async function refreshTriggers(deviceId?: number) {
  triggerCombo.setDisabled(true);
  triggerCombo.setPlaceholder('Loading…');
  try {
    const { triggers } = await Ije.trips.listTriggers({ limit: 200, deviceId });
    triggerCombo.setItems(
      triggers.map(t => ({ value: String(t.id), label: t.name }))
    );
    triggerCombo.setPlaceholder(triggers.length ? 'Search triggers…' : 'No triggers found');
  } catch {
    triggerCombo.setPlaceholder('Failed to load');
    triggerCombo.setItems([]);
  }
  triggerCombo.setDisabled(false);
}

async function populateTripPickers() {
  // Load triggers and devices in parallel.
  const [, devicesResult] = await Promise.allSettled([
    refreshTriggers(),
    Ije.trips.listDevices({ limit: 500 }),
  ]);

  if (devicesResult.status === 'fulfilled') {
    const { devices } = devicesResult.value;
    deviceCombo.setItems(
      devices.map(d => ({
        value: String(d.device_id),
        label: d.name || d.identifier,
        data: { identifier: d.identifier },
      }))
    );
    deviceCombo.setPlaceholder('All devices');
  }
  deviceCombo.setDisabled(false);
}

// Creates a fresh trip-picker map each time; attributes must be set before mount
// so IjeMapTracker reads them in connectedCallback.
function loadTrips() {
  const triggerId = triggerCombo.getValue();
  if (!triggerId) return;

  tripMapContainer.innerHTML = '';

  const map = document.createElement('ije-map-tracker');
  map.setAttribute('trip-picker', '');
  map.setAttribute('trigger-id', triggerId);

  const deviceId = deviceCombo.getValue();
  if (deviceId) map.setAttribute('device-ids', deviceId);

  const triggerName = triggerCombo.getSelectedItem()?.label || '';
  if (triggerName) map.setAttribute('trigger-name', triggerName);

  map.setAttribute('height', '500px');
  map.setAttribute('title', 'Trip Explorer');
  map.style.borderRadius = '8px';
  map.style.overflow = 'hidden';

  tripMapContainer.appendChild(map);
}

function loadLiveTracking() {
  const numericId = deviceCombo.getValue();
  const selectedItem = deviceCombo.getSelectedItem();
  const identifier = selectedItem?.data?.identifier;

  if (!numericId || !identifier) {
    alert('Please select a specific device to start live tracking.');
    return;
  }

  tripMapContainer.innerHTML = '';

  const map = document.createElement('ije-map-tracker');
  map.setAttribute('device-id', identifier);
  map.setAttribute('numeric-device-id', numericId);
  map.setAttribute('height', '500px');
  map.setAttribute('title', `Live – ${selectedItem.label}`);
  map.style.borderRadius = '8px';
  map.style.overflow = 'hidden';

  tripMapContainer.appendChild(map);
}

tripLoadBtn.addEventListener('click', loadTrips);
tripLiveBtn.addEventListener('click', loadLiveTracking);

// ─── Event listeners ──────────────────────────────────────────────────────────

connectBtn.addEventListener('click', () => {
  const token = tokenInput.value.trim();
  if (token) connect(token);
});

tokenInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const token = tokenInput.value.trim();
    if (token) connect(token);
  }
});
