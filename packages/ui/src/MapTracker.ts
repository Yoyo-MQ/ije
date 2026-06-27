import maplibregl from 'maplibre-gl';
import { Ije, type IjeAggregatedEvent } from '@yoyomq/ije-core';
import { createPoweredByYoyo } from './branding';

export class IjeMapTracker extends HTMLElement {
  private map: maplibregl.Map | null = null;
  private deviceId: string | null = null;
  private liveTopic: string | null = null;
  private trailCoordinates: [number, number][] = [];

  private headerDiv: HTMLDivElement | null = null;
  private telemetryBar: HTMLDivElement | null = null;
  private resizeObserver: ResizeObserver | null = null;

  // Trip-picker mode (opt-in via the `trip-picker` attribute + `trigger-id`).
  private mapWrapper: HTMLDivElement | null = null;
  private pickerOverlay: HTMLDivElement | null = null;
  private pickerBar: HTMLDivElement | null = null;
  private trips: IjeAggregatedEvent[] = [];
  private tripIndex = 0;
  private triggerName = '';
  private tripLoadToken = 0; // guards against a slow trip load overwriting a newer one
  private windowStartsAt: number | undefined = undefined; // Unix seconds, set by date picker
  private windowEndsAt: number | undefined = undefined;
  private pickerLoading = false;

  static get observedAttributes() {
    return ['device-id', 'title', 'help-message'];
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (oldValue !== newValue && (name === 'title' || name === 'help-message')) {
      this.renderHeader();
    }
  }

  connectedCallback() {
    this.deviceId = this.getAttribute('device-id');
    
    // Ensure the host element has dimensions
    this.style.display = 'flex';
    this.style.flexDirection = 'column';
    this.style.width = this.getAttribute('width') || '100%';
    this.style.height = this.getAttribute('height') || '400px';
    this.style.position = 'relative';
    this.style.fontFamily = 'var(--yoyo-font, sans-serif)';

    this.renderHeader();

    // Wrapper holds the maplibre container + any overlays as siblings.
    // Keeping overlays outside maplibre's own container (which has overflow:hidden
    // and a WebGL stacking context) is what makes position:absolute overlays reliable.
    const wrapper = document.createElement('div');
    wrapper.style.flex = '1';
    wrapper.style.minHeight = '0';
    wrapper.style.position = 'relative';
    this.mapWrapper = wrapper;
    this.appendChild(wrapper);

    const mapDiv = document.createElement('div');
    mapDiv.style.width = '100%';
    mapDiv.style.height = '100%';
    wrapper.appendChild(mapDiv);

    this.appendChild(createPoweredByYoyo());

    // When this component is inside a display:none parent at page load (e.g. a
    // hidden dashboard), MapLibre initialises with a zero-size canvas and the
    // WebGL viewport never gets updated when the parent becomes visible.
    // Observe the host element and relay size changes to the map so the canvas
    // resets the moment the container is shown.
    this.resizeObserver = new ResizeObserver(() => { this.map?.resize(); });
    this.resizeObserver.observe(this);

    // Initialize MapLibre with pure OpenStreetMap Raster Tiles
    this.map = new maplibregl.Map({
      container: mapDiv,
      style: {
        version: 8,
        sources: {
          'osm': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
          },
          'device-location': {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
          }
        },
        layers: [
          {
            id: 'osm-layer',
            type: 'raster',
            source: 'osm',
            minzoom: 0,
            maxzoom: 19
          },
          {
            id: 'device-trail',
            type: 'line',
            source: 'device-location',
            filter: ['==', '$type', 'LineString'],
            layout: {
              'line-join': 'round',
              'line-cap': 'round'
            },
            paint: {
              'line-color': Ije.config?.theme?.primaryColor || '#8A2BE2',
              'line-width': 4,
              'line-opacity': 0.6
            }
          },
          {
            id: 'device-start-marker',
            type: 'circle',
            source: 'device-location',
            filter: ['==', 'markerType', 'start'],
            paint: {
              'circle-radius': 6,
              'circle-color': '#22c55e',
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff'
            }
          },
          {
            id: 'device-current-marker',
            type: 'circle',
            source: 'device-location',
            filter: ['==', 'markerType', 'current'],
            paint: {
              'circle-radius': 8,
              'circle-color': Ije.config?.theme?.primaryColor || '#8A2BE2',
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff'
            }
          }
        ]
      },
      center: [36.7527816, -1.29457], // Center on Nairobi initial point
      zoom: 14
    });

    // Trip-picker mode replays historical trips and must not also follow the
    // live MQTT feed; the two modes are mutually exclusive.
    if (this.isTripPickerMode()) {
      void this.initTripPicker();
    } else if (this.deviceId) {
      this.renderTelemetryBar();

      // Build the correct broker topic. When both numeric-device-id and the org
      // UUID (from /public/api/v1/context) are available, use the real topic the
      // backend publishes to. Otherwise fall back to the demo-sim topic which is
      // satisfied by local Ije.mqtt.dispatch() calls.
      const numericIdAttrForTopic = this.getAttribute('numeric-device-id');
      const organizationId = Ije.config?.organizationId;
      if (numericIdAttrForTopic && organizationId) {
        this.liveTopic = `yoyo/${organizationId}/data/devices/${numericIdAttrForTopic}`;
      } else {
        this.liveTopic = `device/${this.deviceId}/location`;
      }
      Ije.mqtt.subscribe(this.liveTopic, this.handleLocationUpdate);

      // Seed with the last known position so the map isn't blank while waiting
      // for the next MQTT message. numeric-device-id is required by the REST API.
      const numericIdAttr = this.getAttribute('numeric-device-id');
      if (numericIdAttr) {
        const numericId = Number(numericIdAttr);
        if (Number.isFinite(numericId) && numericId > 0) {
          void this.seedLastPosition(numericId);
        }
      }

      this.renderLiveBadge();
    }
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
    if (this.liveTopic) {
      Ije.mqtt.unsubscribe(this.liveTopic, this.handleLocationUpdate);
    }
    this.map?.remove();
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

    if (!titleAttr && !helpAttr) {
        this.headerDiv.style.display = 'none';
        return;
    }

    this.headerDiv.style.display = 'flex';
    this.headerDiv.innerHTML = `
      <div style="font-weight: 600; font-size: 14px; color: var(--yoyo-foreground, inherit);">
        ${titleAttr || 'Device Map'}
      </div>
      ${helpAttr ? `
      <div title="${helpAttr}" style="cursor: help; color: var(--yoyo-muted, #888); font-size: 12px; background: #eee; border-radius: 4px; padding: 2px 6px;">
        ?
      </div>` : ''}
    `;
  }

  private handleLocationUpdate = (payload: Record<string, any>) => {
    const debug = Ije.config?.debug;
    if (debug) {
      console.log('[Yoyo ije][MapTracker] handler called — styleLoaded:', this.map?.isStyleLoaded(), 'payload:', payload);
    }
    if (!this.map || !this.map.isStyleLoaded()) return;

    // Guard the coordinates before they reach MapLibre. A partial or malformed
    // payload (missing/non-numeric lng/lat, or out-of-range values) would
    // otherwise push NaN/undefined into the trail and break flyTo.
    // Accept common field name variants for GPS coordinates.
    const lng = Number(payload?.lng ?? payload?.lon ?? payload?.longitude ?? payload?.Lng ?? payload?.Lon ?? payload?.Longitude);
    const lat = Number(payload?.lat ?? payload?.latitude ?? payload?.Lat ?? payload?.Latitude);
    if (debug) {
      console.log('[Yoyo ije][MapTracker] coords → lng:', lng, 'lat:', lat,
        Number.isFinite(lng) && Number.isFinite(lat) ? '✓' : `✗ (payload keys: ${Object.keys(payload).join(', ')})`);
    }
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return;

    // Detect large jumps (e.g. mock wrapper looping) to reset trail
    if (this.trailCoordinates.length > 0) {
      const last = this.trailCoordinates[this.trailCoordinates.length - 1];
      const dist = Math.sqrt(Math.pow(last[0] - lng, 2) + Math.pow(last[1] - lat, 2));
      if (dist > 0.002) { // roughly > 200m teleportation instantly jumps to a new trip or loopback
        this.trailCoordinates = [];
      }
    }

    this.trailCoordinates.push([lng, lat]);
    
    const features: any[] = [
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: this.trailCoordinates },
          properties: {}
        }
    ];

    if (this.trailCoordinates.length > 0) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: this.trailCoordinates[0] },
          properties: { markerType: 'start' }
        });
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: this.trailCoordinates[this.trailCoordinates.length - 1] },
          properties: { markerType: 'current' }
        });
    }

    // Imperative Update: Avoids DOM diffing completely for 60fps performance
    // @ts-ignore - maplibre getSource types can be strict
    this.map.getSource('device-location')?.setData({
      type: 'FeatureCollection',
      features
    });
    
    // Automatically slowly pan the camera to follow the point
    this.map.flyTo({ center: [lng, lat], zoom: 16, speed: 0.8 });

    this.updateTelemetryBar(payload);
  }

  // ─── Live mode helpers ──────────────────────────────────────────────────────

  private renderTelemetryBar(): void {
    if (!this.mapWrapper) return;
    const bar = document.createElement('div');
    bar.style.cssText = [
      'display:flex', 'flex-wrap:wrap', 'gap:5px',
      'padding:6px 10px', 'align-items:center',
      'background:var(--yoyo-card-bg,#f4f4f5)',
      'border-bottom:1px solid var(--yoyo-border,#e4e4e7)',
      'font-size:11px', 'font-family:ui-monospace,monospace',
      'min-height:30px', 'line-height:1',
    ].join(';');
    bar.innerHTML = '<span style="color:#aaa;font-style:italic">Waiting for telemetry…</span>';
    this.telemetryBar = bar;
    this.insertBefore(bar, this.mapWrapper);
  }

  private updateTelemetryBar(payload: Record<string, any>): void {
    if (!this.telemetryBar) return;

    const chips = Object.entries(payload)
      .map(([k, v]) => {
        const label = k.replace(/_/g, ' ');
        let val: string;
        if (typeof v === 'number') {
          if (v > 1_000_000_000_000) {
            val = new Date(v).toLocaleTimeString();
          } else if (v > 1_000_000_000 && k.toLowerCase().includes('time')) {
            val = new Date(v * 1000).toLocaleTimeString();
          } else {
            val = Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/\.?0+$/, '');
          }
        } else if (typeof v === 'boolean') {
          val = v ? 'yes' : 'no';
        } else {
          val = String(v);
        }
        return `<span style="background:var(--yoyo-background,#fff);border:1px solid var(--yoyo-border,#e4e4e7);border-radius:4px;padding:2px 7px;white-space:nowrap;color:var(--yoyo-foreground,#111)"><span style="color:#888">${label}</span> <b>${val}</b></span>`;
      });

    this.telemetryBar.innerHTML = chips.length
      ? chips.join('')
      : '<span style="color:#aaa;font-style:italic">No extra fields</span>';
  }

  private renderLiveBadge() {
    if (!this.mapWrapper) return;
    injectLivePulseStyle();
    const badge = document.createElement('div');
    badge.style.cssText = [
      'position:absolute', 'top:10px', 'right:10px', 'z-index:10',
      'background:rgba(0,0,0,0.6)', 'color:#fff',
      'border-radius:20px', 'padding:4px 10px',
      'font-size:11px', 'font-weight:600',
      'display:flex', 'align-items:center', 'gap:5px',
      'pointer-events:none',
    ].join(';');
    badge.innerHTML = `<span class="ije-live-dot"></span>LIVE`;
    this.mapWrapper.appendChild(badge);
  }

  private async seedLastPosition(deviceId: number): Promise<void> {
    try {
      const response = await Ije.trips.getDeviceData({ deviceIds: [deviceId], order: 'DESC', limit: 1 });
      const point = response.data[0];
      if (!point) return;
      const data = point.data ?? {};
      const lat = Number(data.lat ?? data.latitude ?? data.Lat ?? data.Latitude);
      const lng = Number(data.lng ?? data.lon ?? data.longitude ?? data.Lng ?? data.Lon ?? data.Longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
      // Reuse handleLocationUpdate — apply once the style is ready.
      const apply = () => this.handleLocationUpdate({ lat, lng });
      if (this.map?.isStyleLoaded()) apply();
      else this.map?.once('load', apply);
    } catch (err) {
      console.warn('[Yoyo ije] Failed to seed last position:', err);
    }
  }

  // ─── Trip-picker mode ───────────────────────────────────────────────────────

  private isTripPickerMode(): boolean {
    return this.hasAttribute('trip-picker') && !!this.getAttribute('trigger-id');
  }

  // Accepts a comma-separated `device-ids` list (or legacy single `device-id`).
  private getDeviceIds(): number[] {
    const raw = this.getAttribute('device-ids') || this.getAttribute('device-id') || '';
    return raw
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0);
  }

  private getWindow(): { startsAt?: number; endsAt?: number } {
    if (this.windowStartsAt !== undefined || this.windowEndsAt !== undefined) {
      return { startsAt: this.windowStartsAt, endsAt: this.windowEndsAt };
    }
    const startsAttr = this.getAttribute('starts-at');
    const endsAttr   = this.getAttribute('ends-at');
    return {
      startsAt: startsAttr ? Number(startsAttr) : undefined,
      endsAt:   endsAttr   ? Number(endsAttr)   : undefined,
    };
  }

  private async initTripPicker() {
    this.ensurePickerOverlay();
    this.pickerLoading = true;
    this.updatePickerOverlay();

    this.triggerName = this.getAttribute('trigger-name') || '';
    const triggerId = Number(this.getAttribute('trigger-id'));

    try {
      if (!this.triggerName) {
        const { triggers } = await Ije.trips.listTriggers({ limit: 200 });
        this.triggerName = triggers.find((t) => t.id === triggerId)?.name || `Trigger ${triggerId}`;
      }

      const { startsAt, endsAt } = this.getWindow();
      const { aggregated_events } = await Ije.trips.listAggregatedEvents({
        triggerId,
        deviceIds: this.getDeviceIds(),
        startsAt,
        endsAt,
        sortOrder: 'DESC',
        limit: 500,
      });

      this.trips = aggregated_events || [];
      this.tripIndex = 0;
    } catch (err) {
      console.error('[Yoyo ije] Failed to load trips', err);
      this.trips = [];
    } finally {
      this.pickerLoading = false;
      this.updatePickerOverlay();
    }

    if (this.trips.length) await this.plotCurrentTrip();
  }

  private async stepTrip(delta: number) {
    const next = this.tripIndex + delta;
    if (next < 0 || next >= this.trips.length) return;
    this.tripIndex = next;
    this.updatePickerOverlay();
    await this.plotCurrentTrip();
  }

  private async plotCurrentTrip() {
    const event = this.trips[this.tripIndex];
    if (!event || !this.map) return;

    const startsAt = new Date(event.msg_start_time).getTime();
    const endsAt = new Date(event.msg_end_time).getTime();
    const token = ++this.tripLoadToken;

    let path: [number, number][] = [];
    try {
      path = await Ije.trips.getTripPath({ deviceIds: [event.device_id], startsAt, endsAt });
    } catch (err) {
      console.error('[Yoyo ije] Failed to load trip path', err);
      return;
    }
    if (token !== this.tripLoadToken) return; // a newer step superseded this load

    this.renderPath(path);
  }

  // Draws a static trip into the existing `device-location` source (trail + start/end markers).
  private renderPath(path: [number, number][]) {
    if (Ije.config?.debug) {
      console.log(`[Yoyo ije][TripExplorer] renderPath called with ${path.length} coordinates`);
    }
    if (!this.map) return;

    const draw = () => {
      const features: any[] = [
        { type: 'Feature', geometry: { type: 'LineString', coordinates: path }, properties: {} },
      ];
      if (path.length) {
        features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: path[0] }, properties: { markerType: 'start' } });
        features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: path[path.length - 1] }, properties: { markerType: 'current' } });
      }
      // @ts-ignore - maplibre getSource types can be strict
      this.map!.getSource('device-location')?.setData({ type: 'FeatureCollection', features });

      if (path.length) {
        const bounds = path.reduce(
          (acc, coordinate) => acc.extend(coordinate),
          new maplibregl.LngLatBounds(path[0], path[0]),
        );
        this.map!.fitBounds(bounds, { padding: 40, maxZoom: 16, duration: 600 });
      }
    };

    if (this.map.isStyleLoaded()) draw();
    else this.map.once('load', draw);
  }

  private ensurePickerOverlay() {
    if (this.pickerOverlay || !this.mapWrapper) return;

    const primary = Ije.config?.theme?.primaryColor || '#8A2BE2';
    const inputStyle = [
      'flex:1', 'font-size:11px', 'padding:4px 6px',
      'border:1px solid #ddd', 'border-radius:6px',
      'outline:none', 'color:#333', 'background:#fff',
      'min-width:0',
    ].join(';');

    const el = document.createElement('div');
    el.style.cssText = [
      'position:absolute', 'left:12px', 'bottom:12px', 'z-index:10',
      'width:290px', 'padding:10px 14px', 'border-radius:10px',
      'background:rgba(255,255,255,0.97)',
      'box-shadow:0 2px 12px rgba(0,0,0,0.25)',
      'font-family:sans-serif',
    ].join(';');
    el.innerHTML = `
      <div style="margin-bottom:8px;">
        <div style="font-size:10px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px;">Date range</div>
        <div style="display:flex;align-items:center;gap:4px;">
          <input class="ije-tp-from" type="date" style="${inputStyle}">
          <span style="font-size:11px;color:#aaa;flex-shrink:0;">–</span>
          <input class="ije-tp-to" type="date" style="${inputStyle}">
          <button class="ije-tp-go" style="padding:4px 10px;font-size:11px;font-weight:600;border:none;border-radius:6px;background:${primary};color:#fff;cursor:pointer;flex-shrink:0;">Go</button>
        </div>
      </div>
      <div style="border-top:1px solid #eee;margin:0 -14px;padding:8px 14px 0;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div style="min-width:0;">
            <div class="ije-tp-date" style="font-weight:600;font-size:13px;color:#111;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">—</div>
            <div class="ije-tp-trigger" style="font-size:11px;color:#666;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
          </div>
          <div style="display:flex;align-items:center;gap:2px;flex-shrink:0;">
            <button class="ije-tp-prev" aria-label="Previous trip"
              style="border:none;background:none;cursor:pointer;font-size:22px;line-height:1;color:${primary};padding:2px 6px;">‹</button>
            <span class="ije-tp-count" style="font-size:12px;color:#666;min-width:44px;text-align:center;"></span>
            <button class="ije-tp-next" aria-label="Next trip"
              style="border:none;background:none;cursor:pointer;font-size:22px;line-height:1;color:${primary};padding:2px 6px;">›</button>
          </div>
        </div>
      </div>`;

    el.querySelector('.ije-tp-prev')!.addEventListener('click', () => void this.stepTrip(-1));
    el.querySelector('.ije-tp-next')!.addEventListener('click', () => void this.stepTrip(1));
    el.querySelector('.ije-tp-go')!.addEventListener('click', () => {
      const from = (el.querySelector('.ije-tp-from') as HTMLInputElement).value;
      const to   = (el.querySelector('.ije-tp-to')   as HTMLInputElement).value;
      this.windowStartsAt = from ? Math.floor(new Date(from + 'T00:00:00Z').getTime() / 1000) : undefined;
      this.windowEndsAt   = to   ? Math.floor(new Date(to   + 'T23:59:59Z').getTime() / 1000) : undefined;
      void this.initTripPicker();
    });

    this.mapWrapper.appendChild(el);
    this.pickerOverlay = el;
  }

  private updatePickerOverlay() {
    if (!this.pickerOverlay) return;

    const total   = this.trips.length;
    const current = this.trips[this.tripIndex];
    const dateEl  = this.pickerOverlay.querySelector('.ije-tp-date')    as HTMLElement;
    const nameEl  = this.pickerOverlay.querySelector('.ije-tp-trigger') as HTMLElement;
    const countEl = this.pickerOverlay.querySelector('.ije-tp-count')   as HTMLElement;
    const prevBtn = this.pickerOverlay.querySelector('.ije-tp-prev')    as HTMLButtonElement;
    const nextBtn = this.pickerOverlay.querySelector('.ije-tp-next')    as HTMLButtonElement;
    const goBtn   = this.pickerOverlay.querySelector('.ije-tp-go')      as HTMLButtonElement;

    if (this.pickerLoading) {
      dateEl.textContent  = 'Loading…';
      nameEl.textContent  = '';
      countEl.textContent = '';
      prevBtn.disabled = nextBtn.disabled = goBtn.disabled = true;
      prevBtn.style.opacity = nextBtn.style.opacity = '0.3';
      return;
    }

    goBtn.disabled = false;
    dateEl.textContent  = current
      ? new Date(current.msg_start_time).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : 'No trips found';
    nameEl.textContent  = this.triggerName || '';
    countEl.textContent = total ? `${this.tripIndex + 1} / ${total}` : '';
    prevBtn.disabled    = this.tripIndex <= 0;
    nextBtn.disabled    = this.tripIndex >= total - 1;
    prevBtn.style.opacity = prevBtn.disabled ? '0.3' : '1';
    nextBtn.style.opacity = nextBtn.disabled ? '0.3' : '1';
  }
}

// Inject the live-badge pulse keyframe once per page load.
let _livePulseInjected = false;
function injectLivePulseStyle() {
  if (_livePulseInjected || typeof document === 'undefined') return;
  _livePulseInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .ije-live-dot {
      width: 7px; height: 7px; background: #22c55e; border-radius: 50%;
      display: inline-block; animation: ije-live-pulse 1.5s ease-in-out infinite;
    }
    @keyframes ije-live-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
  `;
  document.head.appendChild(style);
}

// Register the custom element globally if in browser
if (typeof window !== 'undefined') {
  customElements.define('ije-map-tracker', IjeMapTracker);
}
