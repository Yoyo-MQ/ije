import maplibregl from 'maplibre-gl';
import { Ije, type IjeAggregatedEvent, type IjeTelemetryPoint } from '@yoyomq/ije-core';
import { createPoweredByYoyo } from './branding';

export class IjeMapTracker extends HTMLElement {
  // Comfortably covers a multi-hour live session at typical device send intervals (5-30s) while keeping
  // the live-updated GeoJSON trail bounded.
  private static readonly MAX_TRAIL_POINTS = 1000;

  // Current-position halo pulse: same 1.5s cadence as the .ije-live-dot pulse used on the
  // LIVE badge (injectLivePulseStyle, below), applied to a MapLibre paint property instead
  // of a CSS animation since a canvas-rendered circle layer can't be animated with CSS.
  private static readonly CURRENT_MARKER_PULSE_PERIOD_MS = 1500;
  private static readonly CURRENT_MARKER_PULSE_MIN_OPACITY = 0.15;
  private static readonly CURRENT_MARKER_PULSE_MAX_OPACITY = 0.4;

  // Marker style control (marker-shape/marker-size/marker-color attributes). Circle stays a
  // MapLibre `circle` layer (cheap, supports the pulse halo); square/pin render as a `symbol`
  // layer using a canvas-generated icon, since MapLibre circle layers can't be non-circular.
  private static readonly MARKER_SIZE_RADIUS_PX: Record<string, number> = { sm: 6, md: 8, lg: 11 };
  private static readonly MARKER_ICON_IMAGE_ID = 'ije-current-marker-icon';

  private map: maplibregl.Map | null = null;
  // Set once by the map's own 'load' event (connectedCallback). renderPath used to check
  // `map.isStyleLoaded()` and fall back to `map.once('load', draw)` -- a real race once
  // event-picker/history mode started awaiting waitForSdkConfig() first: 'load' had often
  // already fired by the time that registration ran, so the once-listener never fired and the
  // route silently never drew. This flag plus waitForMapStyleLoaded() below replace that.
  private mapStyleLoaded = false;
  private currentMarkerPulseFrameId: number | null = null;
  private deviceId: string | null = null;
  private liveTopic: string | null = null;
  private trailCoordinates: [number, number][] = [];
  // The trail's own [0] is trimmed as MAX_TRAIL_POINTS is exceeded, so the "start of this live
  // marker needs its own immutable anchor rather than reading trailCoordinates[0].
  private liveTrailStartCoordinate: [number, number] | null = null;
  private lastPayload: Record<string, any> | null = null;
  private markerPopup: maplibregl.Popup | null = null;

  private headerDiv: HTMLDivElement | null = null;
  private telemetryBar: HTMLDivElement | null = null;
  private resizeObserver: ResizeObserver | null = null;

  // Event-picker mode (opt-in via the `event-picker` attribute + `trigger-id`): steps through one
  // trigger's aggregated events one at a time, with its own prev/next overlay.
  private mapWrapper: HTMLDivElement | null = null;
  private pickerOverlay: HTMLDivElement | null = null;
  private pickerBar: HTMLDivElement | null = null;
  private events: IjeAggregatedEvent[] = [];
  private eventIndex = 0;
  private triggerName = '';
  private pickerLoading = false;
  private windowStartsAt: number | undefined = undefined; // Unix seconds, set by date picker
  private windowEndsAt: number | undefined = undefined;

  // Guards an in-flight telemetry load (event-picker's plotCurrentEvent or history mode's
  // initHistoryMode) against a slower earlier load overwriting a newer one.
  private telemetryLoadToken = 0;

  // Currently plotted window's telemetry (lng/lat/time/speed per point) -- populated by
  // event-picker mode (one trigger event) or history mode (a plain starts-at/ends-at window).
  // Driven by an external Timeline Bar via setPointIndex() -- see "Timeline scrubbing" below.
  private telemetry: IjeTelemetryPoint[] = [];

  static get observedAttributes() {
    return ['device-id', 'title', 'help-message', 'marker-shape', 'marker-size', 'marker-color'];
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (oldValue === newValue) return;
    if (name === 'title' || name === 'help-message') {
      this.renderHeader();
    }
    if (name === 'marker-shape' || name === 'marker-size' || name === 'marker-color') {
      this.applyMarkerStyle();
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

    const poweredByFooter = createPoweredByYoyo();
    if (poweredByFooter) {
      this.appendChild(poweredByFooter);
    }

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
              'line-width': 5,
              'line-opacity': 0.85
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
          // Sits below device-current-marker in the layer stack (drawn first, so the solid
          // dot renders on top) and its opacity is animated by startCurrentMarkerPulse() to
          // echo the ije-live-dot pulse already used on the LIVE badge, giving the live
          // position a "this is moving right now" glow the static start marker doesn't have.
          {
            id: 'device-current-marker-halo',
            type: 'circle',
            source: 'device-location',
            filter: ['==', 'markerType', 'current'],
            paint: {
              'circle-radius': 15,
              'circle-color': Ije.config?.theme?.primaryColor || '#8A2BE2',
              'circle-opacity': IjeMapTracker.CURRENT_MARKER_PULSE_MIN_OPACITY,
              'circle-stroke-width': 0
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
          },
          // Non-circle marker-shape values render here instead (see applyMarkerStyle) --
          // hidden by default since 'circle' (the two layers above) is the default shape.
          {
            id: 'device-current-marker-icon',
            type: 'symbol',
            source: 'device-location',
            filter: ['==', 'markerType', 'current'],
            layout: {
              'icon-image': IjeMapTracker.MARKER_ICON_IMAGE_ID,
              'icon-allow-overlap': true,
              visibility: 'none'
            }
          }
        ]
      },
      center: [36.7527816, -1.29457], // Center on Nairobi initial point
      zoom: 14
    });

    // Register click-to-popup on the current-position marker once the style loads.
    this.map.on('load', () => {
      this.mapStyleLoaded = true;
      this.applyMarkerStyle();
      this.setupMarkerClickHandler();
      // Only live mode has a genuinely "live" current position — event-picker/history mode's
      // "current" marker is a static window end point, so pulsing it would misleadingly suggest
      // motion.
      if (!this.isEventPickerMode() && !this.isHistoryMode()) this.startCurrentMarkerPulse();
    });

    // Live, event-picker, and history are mutually exclusive: event-picker/history replay a
    // static, already-recorded window and must not also follow the live MQTT feed.
    if (this.isEventPickerMode()) {
      void this.initEventPicker();
    } else if (this.isHistoryMode()) {
      void this.initHistoryMode();
    } else if (this.deviceId) {
      this.renderTelemetryBar();
      this.renderLiveBadge();

      document.addEventListener('ije-context-ready', this.handleContextReady as EventListener);

      // If init() already completed before this element mounted, fire immediately.
      if (Ije.config?.organizationId) {
        this.handleContextReady(new CustomEvent('ije-context-ready', {
          detail: { organizationId: Ije.config.organizationId },
        }));
      }
    }
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
    if (this.liveTopic) Ije.mqtt.unsubscribe(this.liveTopic, this.handleLocationUpdate);
    document.removeEventListener('ije-context-ready', this.handleContextReady as EventListener);
    this.stopCurrentMarkerPulse();
    this.markerPopup?.remove();
    this.map?.remove();
  }

  // ─── Current-marker pulse ───────────────────────────────────────────────────

  private startCurrentMarkerPulse() {
    if (this.currentMarkerPulseFrameId !== null) return; // already running

    const { CURRENT_MARKER_PULSE_PERIOD_MS, CURRENT_MARKER_PULSE_MIN_OPACITY, CURRENT_MARKER_PULSE_MAX_OPACITY } =
      IjeMapTracker;
    const opacityRange = CURRENT_MARKER_PULSE_MAX_OPACITY - CURRENT_MARKER_PULSE_MIN_OPACITY;

    const step = (now: number) => {
      if (!this.map || !this.map.getLayer('device-current-marker-halo')) {
        this.currentMarkerPulseFrameId = null;
        return;
      }
      // A cosine wave over the period reproduces ije-live-pulse's 0%→1, 50%→0.3, 100%→1
      // keyframes (a smooth up-down oscillation) without needing a fixed start timestamp.
      const phase = (Math.cos((now / CURRENT_MARKER_PULSE_PERIOD_MS) * Math.PI * 2) + 1) / 2;
      const opacity = CURRENT_MARKER_PULSE_MIN_OPACITY + phase * opacityRange;
      this.map.setPaintProperty('device-current-marker-halo', 'circle-opacity', opacity);
      this.currentMarkerPulseFrameId = requestAnimationFrame(step);
    };
    this.currentMarkerPulseFrameId = requestAnimationFrame(step);
  }

  private stopCurrentMarkerPulse() {
    if (this.currentMarkerPulseFrameId !== null) {
      cancelAnimationFrame(this.currentMarkerPulseFrameId);
      this.currentMarkerPulseFrameId = null;
    }
  }

  private handleContextReady = (e: Event) => {
    const { organizationId } = (e as CustomEvent).detail;
    if (!organizationId || !this.deviceId) return;
    const newTopic = `yoyo/${organizationId}/data/devices/${this.deviceId}`;
    if (newTopic !== this.liveTopic) {
      if (this.liveTopic) Ije.mqtt.unsubscribe(this.liveTopic, this.handleLocationUpdate);
      this.liveTopic = newTopic;
      Ije.mqtt.subscribe(this.liveTopic, this.handleLocationUpdate);
    }
    const numericId = Number(this.deviceId);
    if (Number.isFinite(numericId) && numericId > 0) {
      void this.seedLastPosition(numericId);
    }
  };

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
      <div title="${helpAttr}" style="cursor: help; color: var(--yoyo-muted, #888); font-size: 12px; background: var(--yoyo-tag-bg, #eee); border-radius: 4px; padding: 2px 6px;">
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

    this.lastPayload = payload;
    if (this.markerPopup?.isOpen()) {
      this.markerPopup.setLngLat([lng, lat]);
      this.markerPopup.setDOMContent(this.buildMarkerPopupElement(lat, lng, payload));
    }

    // Detect large jumps (e.g. mock wrapper looping) to reset trail
    if (this.trailCoordinates.length > 0) {
      const last = this.trailCoordinates[this.trailCoordinates.length - 1];
      const dist = Math.sqrt(Math.pow(last[0] - lng, 2) + Math.pow(last[1] - lat, 2));
      if (dist > 0.002) { // roughly > 200m teleportation instantly jumps ahead or loops back
        this.trailCoordinates = [];
        this.liveTrailStartCoordinate = null;
      }
    }

    if (this.liveTrailStartCoordinate === null) {
      this.liveTrailStartCoordinate = [lng, lat];
    }

    this.trailCoordinates.push([lng, lat]);
    // Keep memory (and the GeoJSON re-serialized/re-uploaded to the map source on every single
    // update) bounded for long-running live sessions — a multi-hour shift would otherwise grow
    // this array forever.
    if (this.trailCoordinates.length > IjeMapTracker.MAX_TRAIL_POINTS) {
      this.trailCoordinates.shift();
    }

    const features: any[] = [
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: this.trailCoordinates },
          properties: {}
        }
    ];

    if (this.liveTrailStartCoordinate) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: this.liveTrailStartCoordinate },
          properties: { markerType: 'start' }
        });
    }
    if (this.trailCoordinates.length > 0) {
        const heading = Number(payload?.angle ?? payload?.course ?? payload?.heading ?? payload?.bearing);
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: this.trailCoordinates[this.trailCoordinates.length - 1] },
          properties: { markerType: 'current', ...(Number.isFinite(heading) ? { heading } : {}) }
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
      const response = await Ije.telemetry.getDeviceData({ deviceIds: [deviceId], order: 'DESC', limit: 1 });
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

  // ─── Marker popup ──────────────────────────────────────────────────────────

  private setupMarkerClickHandler() {
    if (!this.map) return;
    // Bound on both the circle marker and its symbol-layer alternative (see applyMarkerStyle)
    // -- only one is ever visible at a time, but whichever it is stays clickable.
    for (const layerId of ['device-current-marker', 'device-current-marker-icon']) {
      this.map.on('click', layerId, (e) => {
        if (!e.lngLat) return;
        injectMaplibrePopupStyle();
        injectLivePulseStyle();
        const lat = e.lngLat.lat;
        const lng = e.lngLat.lng;
        const popupElement = this.buildMarkerPopupElement(lat, lng, this.lastPayload || {});
        if (this.markerPopup) this.markerPopup.remove();
        this.markerPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '260px' })
          .setLngLat(e.lngLat)
          .setDOMContent(popupElement)
          .addTo(this.map!);
      });
      this.map.on('mouseenter', layerId, () => {
        if (this.map) this.map.getCanvas().style.cursor = 'pointer';
      });
      this.map.on('mouseleave', layerId, () => {
        if (this.map) this.map.getCanvas().style.cursor = '';
      });
    }
  }

  // ─── Marker style control (marker-shape/marker-size/marker-color) ─────────────

  /** Reads the marker-style attributes and (re)paints the current-position marker to match. */
  private applyMarkerStyle() {
    if (!this.map || !this.map.isStyleLoaded()) return;

    const shape = this.getAttribute('marker-shape') || 'circle';
    const sizeKey = this.getAttribute('marker-size') || 'md';
    const radius = IjeMapTracker.MARKER_SIZE_RADIUS_PX[sizeKey] ?? IjeMapTracker.MARKER_SIZE_RADIUS_PX.md;
    const color = this.getAttribute('marker-color') || Ije.config?.theme?.primaryColor || '#8A2BE2';

    if (this.map.getLayer('device-current-marker')) {
      this.map.setPaintProperty('device-current-marker', 'circle-radius', radius);
      this.map.setPaintProperty('device-current-marker', 'circle-color', color);
    }
    if (this.map.getLayer('device-current-marker-halo')) {
      this.map.setPaintProperty('device-current-marker-halo', 'circle-radius', radius * 1.9);
      this.map.setPaintProperty('device-current-marker-halo', 'circle-color', color);
    }

    const isCircle = shape === 'circle';
    if (this.map.getLayer('device-current-marker')) {
      this.map.setLayoutProperty('device-current-marker', 'visibility', isCircle ? 'visible' : 'none');
    }
    if (this.map.getLayer('device-current-marker-halo')) {
      // The pulse halo is circle-only (see startCurrentMarkerPulse) -- a symbol layer's
      // icon-opacity isn't driven by the same animation loop, so hide it for other shapes
      // rather than leave a non-pulsing halo behind a square/pin icon.
      this.map.setLayoutProperty('device-current-marker-halo', 'visibility', isCircle ? 'visible' : 'none');
    }
    if (this.map.getLayer('device-current-marker-icon')) {
      this.map.setLayoutProperty('device-current-marker-icon', 'visibility', isCircle ? 'none' : 'visible');
      const rotates = MARKER_ROTATING_SHAPES.has(shape);
      this.map.setLayoutProperty('device-current-marker-icon', 'icon-rotate', rotates ? ['coalesce', ['get', 'heading'], 0] : 0);
      this.map.setLayoutProperty('device-current-marker-icon', 'icon-rotation-alignment', rotates ? 'map' : 'auto');
    }

    if (!isCircle) {
      this.updateMarkerIconImage(shape, color, radius);
    }
  }

  /** (Re)registers the symbol layer's icon image for the given shape/color/size. */
  private updateMarkerIconImage(shape: string, color: string, radius: number) {
    if (!this.map) return;
    const imageData = renderMarkerShapeIcon(shape, color, radius);
    if (!imageData) return;
    if (this.map.hasImage(IjeMapTracker.MARKER_ICON_IMAGE_ID)) {
      this.map.removeImage(IjeMapTracker.MARKER_ICON_IMAGE_ID);
    }
    this.map.addImage(IjeMapTracker.MARKER_ICON_IMAGE_ID, imageData);
  }

  private buildMarkerPopupElement(lat: number, lng: number, payload: Record<string, any>): HTMLDivElement {
    const container = document.createElement('div');
    container.style.cssText = 'font-family:var(--yoyo-font,sans-serif);font-size:12px;min-width:150px;color:var(--yoyo-foreground,#111);';

    const titleElement = document.createElement('div');
    titleElement.style.cssText = 'font-weight:700;font-size:13px;margin-bottom:8px;';
    titleElement.textContent = `Device ${this.deviceId}`;
    container.appendChild(titleElement);

    if (!this.isEventPickerMode() && !this.isHistoryMode()) {
      const liveStatusRow = document.createElement('div');
      liveStatusRow.style.cssText = 'display:flex;align-items:center;gap:5px;margin-bottom:8px;';
      liveStatusRow.innerHTML = `<span class="ije-live-dot" style="flex-shrink:0;"></span><span style="color:#22c55e;font-weight:600;font-size:11px;">LIVE</span>`;
      container.appendChild(liveStatusRow);
    }

    const infoRows: [string, string][] = [];

    const speed = payload.speed ?? payload.Speed;
    if (speed !== undefined) infoRows.push(['Speed', `${typeof speed === 'number' ? speed.toFixed(1) : speed} km/h`]);

    const heading = payload.heading ?? payload.Heading;
    if (heading !== undefined) infoRows.push(['Heading', `${typeof heading === 'number' ? Math.round(heading) : heading}°`]);

    const altitude = payload.altitude ?? payload.Altitude;
    if (altitude !== undefined) infoRows.push(['Altitude', `${typeof altitude === 'number' ? altitude.toFixed(1) : altitude} m`]);

    infoRows.push(['Location', `${lat.toFixed(5)}, ${lng.toFixed(5)}`]);

    const timestamp = payload.timestamp ?? payload.Timestamp ?? payload.time ?? payload.Time;
    if (timestamp !== undefined) {
      const timestampMs = Number(timestamp);
      let formattedTime: string;
      if (timestampMs > 1_000_000_000_000) formattedTime = new Date(timestampMs).toLocaleTimeString();
      else if (timestampMs > 1_000_000_000) formattedTime = new Date(timestampMs * 1000).toLocaleTimeString();
      else formattedTime = String(timestamp);
      infoRows.push(['Time', formattedTime]);
    }

    const infoTable = document.createElement('div');
    infoTable.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
    for (const [label, value] of infoRows) {
      const infoRow = document.createElement('div');
      infoRow.style.cssText = 'display:flex;justify-content:space-between;gap:12px;';
      infoRow.innerHTML = `<span style="color:var(--yoyo-muted,#888);">${label}</span><span style="font-weight:600;">${value}</span>`;
      infoTable.appendChild(infoRow);
    }
    container.appendChild(infoTable);
    return container;
  }

  // ─── Event-picker mode ───────────────────────────────────────────────────────

  private isEventPickerMode(): boolean {
    return this.hasAttribute('event-picker') && !!this.getAttribute('trigger-id');
  }

  // ─── History mode ───────────────────────────────────────────────────────────
  // Opt-in via the `history` attribute: a device's own telemetry with no trigger involved --
  // e.g. a host's own date-range picker showing "whatever we have for this device", not tied to
  // any event. starts-at/ends-at are both optional within this mode: given, they bound the
  // window (walked chronologically); omitted, it's "recent activity" (most recent points, see
  // getTelemetry). Mutually exclusive with event-picker mode (which takes priority if both are
  // set) and with live mode (a bare device-id with neither `event-picker` nor `history` set).

  private isHistoryMode(): boolean {
    return !this.isEventPickerMode() && this.hasAttribute('history');
  }

  // Opt-in for hosts that drive the window from their own UI (e.g. yoyo-frontend's
  // playback range control) and don't want event-picker's built-in date inputs duplicating it.
  // The prev/next/count event-navigation row stays -- only the "Date range" inputs are hidden.
  private isDateRangePickerHidden(): boolean {
    return this.hasAttribute('hide-date-range-picker');
  }

  // Accepts a comma-separated `device-ids` list (or legacy single `device-id`).
  private getDeviceIds(): number[] {
    const raw = this.getAttribute('device-ids') || this.getAttribute('device-id') || '';
    return raw
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0);
  }

  // Unix seconds -- matches listAggregatedEvents' convention. History mode converts to
  // milliseconds itself before calling getTelemetry (see initHistoryMode).
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

  // A host's `Ije.init(config)` call (e.g. IjeProvider's own useEffect) always runs strictly
  // after this element's connectedCallback -- DOM insertion (and therefore connectedCallback)
  // happens synchronously during React's commit phase, while useEffect is a passive effect that
  // only runs afterward. Live mode already handles this by deferring its network-dependent work
  // to the `ije-context-ready` event (see handleContextReady); event-picker/history mode fetch
  // immediately in connectedCallback and need the same kind of wait, just for the config itself
  // (not the fuller org-context resolution `ije-context-ready` signals).
  private waitForSdkConfig(): Promise<void> {
    if (Ije.config) return Promise.resolve();
    return new Promise((resolve) => {
      const check = () => {
        if (Ije.config) resolve();
        else requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  }

  // See mapStyleLoaded's own comment: waits for the map's 'load' event (already fired or not)
  // without the once-listener race renderPath used to have.
  private waitForMapStyleLoaded(): Promise<void> {
    if (this.mapStyleLoaded) return Promise.resolve();
    return new Promise((resolve) => {
      const check = () => {
        if (this.mapStyleLoaded) resolve();
        else requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  }

  private async initEventPicker() {
    await this.waitForSdkConfig();
    this.ensurePickerOverlay();
    this.pickerLoading = true;
    this.updatePickerOverlay();

    this.triggerName = this.getAttribute('trigger-name') || '';
    const triggerId = Number(this.getAttribute('trigger-id'));

    try {
      if (!this.triggerName) {
        const { triggers } = await Ije.telemetry.listTriggers({ limit: 200 });
        this.triggerName = triggers.find((t) => t.id === triggerId)?.name || `Trigger ${triggerId}`;
      }

      const { startsAt, endsAt } = this.getWindow();
      const { aggregated_events } = await Ije.telemetry.listAggregatedEvents({
        triggerId,
        deviceIds: this.getDeviceIds(),
        startsAt,
        endsAt,
        sortOrder: 'DESC',
        limit: 500,
      });

      this.events = aggregated_events || [];
      this.eventIndex = 0;
    } catch (err) {
      console.error('[Yoyo ije] Failed to load events', err);
      this.events = [];
    } finally {
      this.pickerLoading = false;
      this.updatePickerOverlay();
    }

    if (this.events.length) await this.plotCurrentEvent();
  }

  private async stepEvent(delta: number) {
    const next = this.eventIndex + delta;
    if (next < 0 || next >= this.events.length) return;
    this.eventIndex = next;
    this.updatePickerOverlay();
    await this.plotCurrentEvent();
  }

  /** Activates the aggregated event with `eventId` -- e.g. from clicking an Events-tab
   *  row in the host app, so the row's "jump to a location in the player" click has somewhere to
   *  jump to. No-ops if that event isn't in the currently loaded list. */
  async selectEvent(eventId: number): Promise<void> {
    const index = this.events.findIndex((event) => event.id === eventId);
    if (index === -1 || index === this.eventIndex) return;
    this.eventIndex = index;
    this.updatePickerOverlay();
    await this.plotCurrentEvent();
  }

  private async plotCurrentEvent() {
    const event = this.events[this.eventIndex];
    if (!event || !this.map) return;

    this.telemetry = [];

    const startsAt = new Date(event.msg_start_time).getTime();
    const endsAt = new Date(event.msg_end_time).getTime();
    const token = ++this.telemetryLoadToken;

    let telemetry: IjeTelemetryPoint[] = [];
    try {
      telemetry = await Ije.telemetry.getTelemetry({ deviceIds: [event.device_id], startsAt, endsAt });
    } catch (err) {
      console.error('[Yoyo ije] Failed to load event telemetry', err);
      return;
    }
    if (token !== this.telemetryLoadToken) return; // a newer step superseded this load

    this.telemetry = telemetry;
    this.renderPath(telemetry.map((point) => [point.lng, point.lat]));
    this.updatePickerOverlay();
    this.dispatchEvent(new CustomEvent('ije-telemetry-changed', {
      detail: { points: telemetry, event },
      bubbles: true,
      composed: true,
    }));
  }

  /** Fetches and plots a device's telemetry with no trigger involved -- the widget owns the
   *  fetch itself (Ije.telemetry.getTelemetry), same as event-picker mode does for a resolved
   *  event; the host only ever passes props/attributes, never raw points. starts-at/ends-at are
   *  optional here: given, they bound the window; omitted, getTelemetry falls back to recent
   *  activity. */
  private async initHistoryMode() {
    await this.waitForSdkConfig();
    const deviceIds = this.getDeviceIds();
    if (!deviceIds.length) return;
    const { startsAt, endsAt } = this.getWindow(); // Unix seconds, either/both may be undefined

    this.telemetry = [];
    const token = ++this.telemetryLoadToken;

    let telemetry: IjeTelemetryPoint[] = [];
    try {
      telemetry = await Ije.telemetry.getTelemetry({
        deviceIds,
        startsAt: startsAt != null ? startsAt * 1000 : undefined,
        endsAt: endsAt != null ? endsAt * 1000 : undefined,
      });
    } catch (err) {
      console.error('[Yoyo ije] Failed to load telemetry', err);
      return;
    }
    if (token !== this.telemetryLoadToken) return; // a newer window superseded this load

    this.telemetry = telemetry;
    this.renderPath(telemetry.map((point) => [point.lng, point.lat]));
    this.dispatchEvent(new CustomEvent('ije-telemetry-changed', {
      detail: { points: telemetry },
      bubbles: true,
      composed: true,
    }));
  }

  // Draws a static path into the existing `device-location` source (trail + start/end markers).
  private renderPath(path: [number, number][]) {
    if (Ije.config?.debug) {
      console.log(`[Yoyo ije][RenderPath] renderPath called with ${path.length} coordinates`);
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

    if (this.mapStyleLoaded) draw();
    else void this.waitForMapStyleLoaded().then(draw);
  }

  // ─── Timeline scrubbing (public API) ────────────────────────────────────────
  // Play/pause/speed/drag-to-seek live in the host app's own Timeline Bar; this widget just
  // exposes telemetry (via the `ije-telemetry-changed` event) and setPointIndex to move the marker.

  getPointCount(): number {
    return this.telemetry.length;
  }

  /** Moves the current-position marker and trail to `this.telemetry[index]`, clamped to range. */
  setPointIndex(index: number): void {
    if (!this.map || this.telemetry.length === 0) return;
    const clamped = Math.max(0, Math.min(index, this.telemetry.length - 1));
    const trail = this.telemetry.slice(0, clamped + 1).map((point): [number, number] => [point.lng, point.lat]);
    const current = trail[trail.length - 1];
    const start: [number, number] = [this.telemetry[0].lng, this.telemetry[0].lat];

    const features: any[] = [
      { type: 'Feature', geometry: { type: 'LineString', coordinates: trail }, properties: {} },
      { type: 'Feature', geometry: { type: 'Point', coordinates: start }, properties: { markerType: 'start' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: current }, properties: { markerType: 'current' } },
    ];
    // @ts-ignore - maplibre getSource types can be strict
    this.map.getSource('device-location')?.setData({ type: 'FeatureCollection', features });
  }

  private ensurePickerOverlay() {
    if (this.pickerOverlay || !this.mapWrapper) return;

    const primary = Ije.config?.theme?.primaryColor || '#8A2BE2';
    const inputStyle = [
      'flex:1', 'font-size:11px', 'padding:4px 6px',
      'border:1px solid var(--yoyo-border,#ddd)', 'border-radius:6px',
      'outline:none', 'color:var(--yoyo-foreground,#333)', 'background:var(--yoyo-background,#fff)',
      'min-width:0',
    ].join(';');

    const el = document.createElement('div');
    el.style.cssText = [
      'position:absolute', 'left:12px', 'bottom:12px', 'z-index:10',
      'width:290px', 'padding:10px 14px', 'border-radius:10px',
      // color-mix keeps the near-opaque "floating glass panel" look of the original
      // rgba(255,255,255,0.97) in both themes without needing a dedicated overlay
      // CSS variable — it tints whatever --yoyo-card-bg resolves to.
      'background:color-mix(in srgb, var(--yoyo-card-bg, #fff) 97%, transparent)',
      'box-shadow:0 2px 12px rgba(0,0,0,0.25)',
      'font-family:sans-serif',
      'color:var(--yoyo-foreground,#111)',
    ].join(';');
    const dateRangeHidden = this.isDateRangePickerHidden();
    const dateRangeHtml = dateRangeHidden ? '' : `
      <div style="margin-bottom:8px;">
        <div style="font-size:10px;font-weight:600;color:var(--yoyo-muted,#888);text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px;">Date range</div>
        <div style="display:flex;align-items:center;gap:4px;">
          <input class="ije-ep-from" type="date" style="${inputStyle}">
          <span style="font-size:11px;color:var(--yoyo-muted,#aaa);flex-shrink:0;">–</span>
          <input class="ije-ep-to" type="date" style="${inputStyle}">
          <button class="ije-ep-go" style="padding:4px 10px;font-size:11px;font-weight:600;border:none;border-radius:6px;background:${primary};color:#fff;cursor:pointer;flex-shrink:0;">Go</button>
        </div>
      </div>`;
    // Without the date-range block above, the nav row is the top of the panel -- drop the
    // divider/negative-margin that otherwise separates it from that block.
    const navRowStyle = dateRangeHidden
      ? ''
      : 'border-top:1px solid var(--yoyo-border,#eee);margin:0 -14px;padding:8px 14px 0;';
    el.innerHTML = `
      ${dateRangeHtml}
      <div style="${navRowStyle}">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div style="min-width:0;">
            <div class="ije-ep-date" style="font-weight:600;font-size:13px;color:var(--yoyo-foreground,#111);line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">—</div>
            <div class="ije-ep-trigger" style="font-size:11px;color:var(--yoyo-muted,#666);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
          </div>
          <div style="display:flex;align-items:center;gap:2px;flex-shrink:0;">
            <button class="ije-ep-prev" aria-label="Previous event"
              style="border:none;background:none;cursor:pointer;font-size:22px;line-height:1;color:${primary};padding:2px 6px;">‹</button>
            <span class="ije-ep-count" style="font-size:12px;color:var(--yoyo-muted,#666);min-width:44px;text-align:center;"></span>
            <button class="ije-ep-next" aria-label="Next event"
              style="border:none;background:none;cursor:pointer;font-size:22px;line-height:1;color:${primary};padding:2px 6px;">›</button>
          </div>
        </div>
      </div>`;

    el.querySelector('.ije-ep-prev')!.addEventListener('click', () => void this.stepEvent(-1));
    el.querySelector('.ije-ep-next')!.addEventListener('click', () => void this.stepEvent(1));
    el.querySelector('.ije-ep-go')?.addEventListener('click', () => {
      const from = (el.querySelector('.ije-ep-from') as HTMLInputElement).value;
      const to   = (el.querySelector('.ije-ep-to')   as HTMLInputElement).value;
      this.windowStartsAt = from ? Math.floor(new Date(from + 'T00:00:00Z').getTime() / 1000) : undefined;
      this.windowEndsAt   = to   ? Math.floor(new Date(to   + 'T23:59:59Z').getTime() / 1000) : undefined;
      void this.initEventPicker();
    });

    this.mapWrapper.appendChild(el);
    this.pickerOverlay = el;
  }

  private updatePickerOverlay() {
    if (!this.pickerOverlay) return;

    const total   = this.events.length;
    const current = this.events[this.eventIndex];
    const dateEl  = this.pickerOverlay.querySelector('.ije-ep-date')    as HTMLElement;
    const nameEl  = this.pickerOverlay.querySelector('.ije-ep-trigger') as HTMLElement;
    const countEl = this.pickerOverlay.querySelector('.ije-ep-count')   as HTMLElement;
    const prevBtn = this.pickerOverlay.querySelector('.ije-ep-prev') as HTMLButtonElement;
    const nextBtn = this.pickerOverlay.querySelector('.ije-ep-next') as HTMLButtonElement;
    const goBtn   = this.pickerOverlay.querySelector('.ije-ep-go')   as HTMLButtonElement | null;

    if (this.pickerLoading) {
      dateEl.textContent  = 'Loading…';
      nameEl.textContent  = '';
      countEl.textContent = '';
      prevBtn.disabled = nextBtn.disabled = true;
      if (goBtn) goBtn.disabled = true;
      prevBtn.style.opacity = nextBtn.style.opacity = '0.3';
      return;
    }

    if (goBtn) goBtn.disabled = false;
    dateEl.textContent  = current
      ? new Date(current.msg_start_time).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : 'No events found';
    nameEl.textContent  = this.triggerName || '';
    countEl.textContent = total ? `${this.eventIndex + 1} / ${total}` : '';
    prevBtn.disabled    = this.eventIndex <= 0;
    nextBtn.disabled    = this.eventIndex >= total - 1;
    prevBtn.style.opacity = prevBtn.disabled ? '0.3' : '1';
    nextBtn.style.opacity = nextBtn.disabled ? '0.3' : '1';
  }
}

interface MarkerSvgIcon {
  path: string;
  viewBox: { width: number; height: number };
}

// Free/no-attribution SVGs from uxwing.com. 'car' and 'drone' are genuine top-down views (nose
// pointing up) so they rotate with heading (see MARKER_ROTATING_SHAPES/applyMarkerStyle);
// 'motorcycle' and 'truck' only exist as side-view silhouettes -- no top-down source exists for
// either -- so they stay upright regardless of heading.
const MARKER_SVG_ICONS: Record<string, MarkerSvgIcon> = {
  car: {
    // https://uxwing.com/car-top-view-icon/
    path: 'M42.3 110.94c2.22 24.11 2.48 51.07 1.93 79.75-13.76.05-24.14 1.44-32.95 6.69-4.96 2.96-8.38 6.28-10.42 12.15-1.37 4.3-.36 7.41 2.31 8.48 4.52 1.83 22.63-.27 28.42-1.54 2.47-.54 4.53-1.28 5.44-2.33.55-.63 1-1.4 1.35-2.31 1.49-3.93.23-8.44 3.22-12.08.73-.88 1.55-1.37 2.47-1.61-1.46 62.21-6.21 131.9-2.88 197.88 0 43.41 1 71.27 43.48 97.95 41.46 26.04 117.93 25.22 155.25-8.41 32.44-29.23 30.38-50.72 30.38-89.54 5.44-70.36 1.21-134.54-.79-197.69.69.28 1.32.73 1.89 1.42 2.99 3.64 1.73 8.15 3.22 12.08.35.91.8 1.68 1.35 2.31.91 1.05 2.97 1.79 5.44 2.33 5.79 1.27 23.9 3.37 28.42 1.54 2.67-1.07 3.68-4.18 2.31-8.48-2.04-5.87-5.46-9.19-10.42-12.15-8.7-5.18-18.93-6.6-32.44-6.69-.75-25.99-1.02-51.83-.01-77.89C275.52-48.32 29.74-25.45 42.3 110.94zm69.63-90.88C83.52 30.68 62.75 48.67 54.36 77.59c21.05-15.81 47.13-39.73 57.57-57.53zm89.14-4.18c28.41 10.62 49.19 28.61 57.57 57.53-21.05-15.81-47.13-39.73-57.57-57.53zM71.29 388.22l8.44-24.14c53.79 8.36 109.74 7.72 154.36-.15l7.61 22.8c-60.18 28.95-107.37 32.1-170.41 1.49zm185.26-34.13c5.86-34.1 4.8-86.58-1.99-120.61-12.64 47.63-9.76 74.51 1.99 120.61zM70.18 238.83l-10.34-47.2c45.37-57.48 148.38-53.51 193.32 0l-12.93 47.2c-57.58-14.37-114.19-13.21-170.05 0zM56.45 354.09c-5.86-34.1-4.8-86.58 1.99-120.61 12.63 47.63 9.76 74.51-1.99 120.61z',
    viewBox: { width: 313, height: 512.52 },
  },
  drone: {
    // https://uxwing.com/drone-icon/
    path: 'M20.72,8.03V4.92L3.79,6.54C0.53,6.9-0.14,5.78,0.02,4.59C0.43,1.64,2,2.33,4.25,2.45l16.46,0.83V1.16 c0-0.64,0.52-1.16,1.16-1.16h0.98c0.64,0,1.16,0.52,1.16,1.16v2.11L40.52,1.8c2.25-0.12,3.82-0.81,4.23,2.15 c0.16,1.18-0.51,2.31-3.77,1.94L24.03,4.92v3.11h1.23c0.88,0,1.6,0.72,1.6,1.6v5.77h69.15V9.68c0-0.9,0.74-1.65,1.65-1.65h1.17 V4.92L81.9,6.54c-3.27,0.37-3.93-0.76-3.77-1.94c0.41-2.96,1.98-2.26,4.23-2.15l16.46,0.83V1.16c0-0.64,0.52-1.16,1.16-1.16h0.98 c0.64,0,1.16,0.52,1.16,1.16v2.11l16.49-1.47c2.25-0.12,3.82-0.81,4.23,2.15c0.16,1.18-0.51,2.31-3.77,1.94l-16.95-0.97v3.11h1.23 c0.88,0,1.6,0.72,1.6,1.6v5.77h13.85c1.67,0,3.04,1.37,3.04,3.04l0,0c0,1.67-1.37,3.04-3.04,3.04H93.85 c-2.32,3.29-8.94,4.56-18.66,4.38c3.32,3.1,6.52,6.6,9.54,10.77c4.01,5.39,7.38,11.07,9.26,17.38c0.65,7.28-6.69,6.05-9.07,4.63 c-3.49-0.44-3.48-6.04-3.76-11.22c-0.25-4.57-0.74-8.99-4.24-12.35c-1.73-1.66-4.14-3.08-7.39-4.2c-0.77,0.74-1.7,1.41-2.77,2.02 c-5,2.83-9.66,3.61-13.55-2.49c-2.27,0.67-4.22,1.69-5.87,3.03c-6.69,5.4-6.44,12.92-6.78,21.15c-0.82,5.72-13.35,8.46-12.33-0.91 c0.2-1.86,1.05-3.54,2.23-5.13c4.62-8.98,9.98-16.78,16.59-22.55c-8.48,0.18-15.05-1.06-18.7-4.5H3.13c-1.67,0-3.04-1.37-3.04-3.04 l0,0c0-1.67,1.37-3.04,3.04-3.04H17.9V9.68c0-0.9,0.74-1.65,1.65-1.65H20.72L20.72,8.03z M58.44,23.91h5.06 c0.75,0,1.36,0.61,1.36,1.36l0,0c0,0.75-0.61,1.36-1.36,1.36h-5.06c-0.74,0-1.36-0.61-1.36-1.36l0,0 C57.09,24.52,57.7,23.91,58.44,23.91L58.44,23.91z',
    viewBox: { width: 122.88, height: 59.81 },
  },
  motorcycle: {
    // https://uxwing.com/bike-motorcycle-icon/ -- side view, not rotated with heading
    path: 'M50.7,36.7l-0.16-0.68c-2.39,0.65-4.79,0.86-7.21,0.78c-2.76-0.09-5.52-0.56-8.28-1.19 c-1.35-0.31-2.53-0.64-3.65-0.96c-2.52-0.71-4.74-1.33-7.8-1.36c-0.03,0-0.05,0-0.08,0l0,0l-11.07-0.94l-2.18,3.14 c6.36,2.46,14.26,4.18,21.86,4.85c7.17,0.63,14.04,0.34,19.05-1.14L50.7,36.7L50.7,36.7z M104.65,46.26 c10.07,0,18.23,8.16,18.23,18.23c0,10.07-8.16,18.23-18.23,18.23c-10.07,0-18.23-8.16-18.23-18.23c0-6.08,2.97-11.46,7.54-14.77 l-5.29-10.4l-9.71,29.2h-4.29c0,0.12,0,0.24-0.02,0.35c-0.36,1.98-0.97,3.58-1.83,4.78c-0.96,1.34-2.21,2.2-3.76,2.57 c-1.89,0.45-7.19-0.4-10.65-0.95c-0.92-0.15-1.71-0.27-2.22-0.34l-11.41-1.53l-0.05,0.18c-0.27,1.08-1.32,1.79-2.44,1.61 l-7.08-1.16c-0.76,1.2-1.66,2.3-2.67,3.29c-3.35,3.28-7.99,5.31-13.1,5.31c-5.11,0-9.74-2.03-13.1-5.31 c-3.36-3.29-5.44-7.83-5.44-12.84c0-5.01,2.08-9.55,5.44-12.84c3.35-3.28,7.99-5.31,13.1-5.31c5.11,0,9.74,2.03,13.1,5.31 c3.36,3.29,5.44,7.83,5.44,12.84c0,0.56-0.03,1.11-0.08,1.65l6.17,1.71c1.06,0.29,1.72,1.34,1.56,2.4l10.97,1.47 c0.57,0.08,1.37,0.2,2.31,0.35c3.2,0.51,8.11,1.29,9.4,0.99c0.76-0.18,1.38-0.62,1.87-1.3c0.56-0.78,0.97-1.87,1.24-3.25H45.37 C37.45,41.52,17.65,37.82,6.29,47.48L0,47.4c1.88-4.56,6.3-7.52,11.67-9.11c-1.19-0.41-2.33-0.84-3.43-1.3 c-0.09-0.03-0.17-0.07-0.25-0.13c-0.49-0.34-0.61-1.01-0.27-1.5l3.29-4.74c0.21-0.32,0.59-0.52,1-0.49l11.69,0.99v0 c3.33,0.05,5.65,0.7,8.29,1.44c1.1,0.31,2.26,0.63,3.55,0.93c2.64,0.61,5.27,1.06,7.86,1.14c2.49,0.08,4.97-0.17,7.42-0.96 c0.8-0.71,1.61-1.39,2.45-2.04c0.87-0.68,1.79-1.34,2.77-1.99c2.61-1.74,5.29-3.13,8.12-4.08c2.85-0.95,5.84-1.45,9.07-1.39 c1.99,0.04,3.92,0.34,5.75,0.97c1.26,0.44,2.48,1.03,3.64,1.79c0.01-0.2,0.08-0.4,0.2-0.56l-5.77-4.33h-9.02 c-1.05,0-1.89-0.85-1.89-1.89c0-1.05,0.85-1.89,1.89-1.89h8.31v-7.54h0.01l0-0.04c0.01-0.25,0-0.48-0.03-0.68 c-0.02-0.17-0.06-0.33-0.11-0.49c-0.16-0.49-0.5-0.7-0.96-0.98c-0.03-0.01-0.05-0.03-0.08-0.04c-0.05-0.03-0.1-0.06-0.22-0.13 l-0.08,1.3c-0.05,0.77-0.71,1.36-1.49,1.31c-0.77-0.05-1.36-0.71-1.31-1.49l0.52-8.19c0.05-0.77,0.71-1.36,1.49-1.31 c0.77,0.05,1.36,0.71,1.31,1.49l-0.24,3.73l1.05,0.64l0.39,0.23c0.03,0.01,0.05,0.03,0.07,0.05c1,0.58,1.73,1.04,2.22,2.53 c0.1,0.3,0.17,0.63,0.22,1c0.04,0.33,0.06,0.69,0.05,1.07h0v8.19l3.66,2.74l0.33-0.38l-0.86-0.62c-0.48-0.35-0.59-1.03-0.24-1.51 c0.03-0.04,0.06-0.08,0.09-0.11l3.37-3.93c0.39-0.45,1.07-0.51,1.52-0.12l0.02,0.02l3.15,2.59c0.46,0.38,0.53,1.06,0.15,1.52 l-0.02,0.03h0l-3.29,3.75c-0.13,0.15-0.29,0.25-0.46,0.31l0,0l-1.17,0.4l1.07,0.8l0.03,0.03l0.32-0.16 c0.53-0.26,1.18-0.04,1.45,0.49l0.02,0.03l1.54,2.94c0.74-1.66,2.39-2.8,3.83-3.8c0.3-0.21,0.6-0.42,0.86-0.61 c1.13-0.84,2.18-1.38,3.13-1.62c1.05-0.27,2-0.19,2.81,0.21c0.81,0.41,1.44,1.12,1.85,2.13c0.37,0.91,0.57,2.06,0.57,3.44v3.98 c0,0.05,0,0.11-0.01,0.16c-0.11,1.76-0.51,3.03-1.14,3.89c-0.39,0.53-0.85,0.9-1.38,1.14c-0.53,0.24-1.1,0.33-1.7,0.3 c-1.29-0.07-2.74-0.74-4.24-1.85l-1.15-0.85l6.79,12.58C101.51,46.46,103.06,46.26,104.65,46.26L104.65,46.26z M95.81,48.54 c0.69-0.39,1.41-0.73,2.16-1.02L86.95,26.9c-0.03,0.05-0.06,0.1-0.1,0.15c-0.45,0.28-1.01,0.63-1.55,0.75L95.81,48.54L95.81,48.54z M12.84,59.22l4.52,1.25c0.33-0.16,0.67-0.28,1.04-0.36l0.28-7.2l-0.05,0l-0.09,0.01c-0.08,0.01-0.16,0.01-0.24,0.02l-0.03,0 l-0.01,0c-0.09,0.01-0.17,0.02-0.26,0.03l-0.09,0.01c-0.06,0.01-0.12,0.02-0.17,0.02l-0.1,0.02c-0.06,0.01-0.12,0.02-0.17,0.03 l-0.09,0.02c-0.07,0.01-0.14,0.03-0.21,0.04l-0.05,0.01c-0.09,0.02-0.17,0.04-0.26,0.06l-0.08,0.02c-0.06,0.01-0.12,0.03-0.18,0.04 l-0.1,0.03l-0.17,0.05l-0.09,0.02c-0.07,0.02-0.14,0.04-0.2,0.06l-0.05,0.01c-0.08,0.03-0.16,0.05-0.24,0.08l-0.09,0.03 c-0.05,0.02-0.11,0.04-0.16,0.06l-0.1,0.04l-0.15,0.06l-0.1,0.04c-0.05,0.02-0.1,0.04-0.15,0.06l-0.09,0.04 c-0.07,0.03-0.15,0.06-0.22,0.1l-0.09,0.04l-0.14,0.07l-0.11,0.05l-0.12,0.06l-0.11,0.06L14,54.24l-0.1,0.05l-0.01,0 c-0.07,0.04-0.13,0.07-0.2,0.11l0,0l-0.12,0.07l-0.09,0.05c-0.04,0.02-0.08,0.05-0.12,0.08l-0.09,0.06l-0.12,0.08l-0.09,0.06 l-0.13,0.08l-0.03,0.02c-0.1,0.07-0.2,0.14-0.3,0.21l-0.06,0.04l-0.13,0.1l-0.07,0.06c-0.04,0.03-0.08,0.06-0.12,0.1l-0.06,0.05 c-0.15,0.12-0.3,0.25-0.45,0.38l-0.03,0.02c-0.04,0.04-0.09,0.08-0.13,0.12l-0.05,0.05c-0.04,0.04-0.08,0.08-0.13,0.12l-0.05,0.05 c-0.04,0.04-0.08,0.08-0.12,0.12l-0.02,0.02c-0.15,0.15-0.29,0.3-0.42,0.45l-0.03,0.03c-0.04,0.05-0.08,0.1-0.13,0.15L10.59,57 c-0.15,0.17-0.29,0.35-0.43,0.54L12.84,59.22L12.84,59.22z M25.06,62.6l6,1.66c-0.03-1.53-0.36-3-0.93-4.33L25.06,62.6L25.06,62.6z M27.57,72.79l-7.26-1.19l-0.11,4.48l0.12-0.01l0.05,0c0.09-0.01,0.17-0.01,0.26-0.02l0.06-0.01c0.08-0.01,0.15-0.02,0.23-0.03 l0.04,0c0.08-0.01,0.16-0.02,0.24-0.03l0.08-0.01c0.08-0.01,0.16-0.03,0.25-0.04l0.01,0c0.08-0.01,0.16-0.03,0.24-0.05l0.06-0.01 c0.08-0.02,0.16-0.03,0.24-0.05l0.04-0.01c0.07-0.02,0.14-0.03,0.21-0.05l0.06-0.02c0.08-0.02,0.16-0.04,0.23-0.06l0.06-0.02 c0.07-0.02,0.15-0.04,0.22-0.07l0.02-0.01l0.01,0c0.07-0.02,0.15-0.05,0.22-0.07l0.08-0.03c0.07-0.02,0.14-0.05,0.21-0.08 l0.06-0.02c0.06-0.02,0.11-0.04,0.17-0.07l0.08-0.03c0.07-0.03,0.13-0.05,0.2-0.08l0.09-0.04l0.14-0.06l0.08-0.04 c0.06-0.03,0.12-0.06,0.18-0.09l0.11-0.05l0.12-0.06c0.05-0.03,0.1-0.05,0.15-0.08l0.11-0.06l0.11-0.06 c0.05-0.03,0.1-0.05,0.15-0.08c0.04-0.02,0.08-0.05,0.13-0.07l0.1-0.06l0.11-0.07c0.05-0.03,0.1-0.06,0.15-0.09l0,0l0.12-0.08 l0.07-0.04c0.07-0.05,0.14-0.09,0.2-0.14L26.11,74l0.12-0.09l0.05-0.03c0.08-0.06,0.15-0.11,0.23-0.17l0.03-0.03 c0.04-0.03,0.08-0.07,0.13-0.1l0.02-0.01c0.08-0.06,0.16-0.13,0.24-0.19l0.05-0.04c0.13-0.11,0.25-0.22,0.37-0.33l0,0 C27.42,72.94,27.49,72.87,27.57,72.79L27.57,72.79z M18.16,71.25l-6.88-1.13l-1.49,0.81l0.01,0.02c0.03,0.04,0.06,0.08,0.09,0.13 l0.06,0.09l0.09,0.12l0.06,0.09c0.03,0.04,0.06,0.08,0.09,0.12l0.06,0.08l0.09,0.12l0.07,0.08c0.03,0.04,0.06,0.08,0.1,0.12 c0.03,0.03,0.05,0.06,0.08,0.1c0.03,0.03,0.05,0.06,0.08,0.1l0,0c0.05,0.06,0.11,0.12,0.16,0.18l0.1,0.11l0.08,0.08 c0.03,0.03,0.06,0.06,0.09,0.1l0.09,0.1l0.09,0.08l0.1,0.1l0.09,0.09l0.09,0.09l0.1,0.09l0.09,0.08l0.1,0.08l0.11,0.09 c0.03,0.03,0.06,0.05,0.09,0.08c0.06,0.05,0.13,0.1,0.19,0.15l0,0l0.08,0.06c0.04,0.03,0.08,0.06,0.13,0.1l0.1,0.08l0.1,0.08 l0.11,0.08l0.11,0.08l0.11,0.08l0.11,0.07l0.11,0.07c0.04,0.03,0.08,0.05,0.12,0.08l0.1,0.06c0.05,0.03,0.1,0.06,0.15,0.09 l0.08,0.05c0.08,0.04,0.15,0.09,0.23,0.13l0.08,0.04c0.05,0.03,0.1,0.06,0.16,0.08l0.1,0.05l0.14,0.07l0.1,0.05l0.14,0.07 l0.11,0.05c0.05,0.02,0.09,0.04,0.14,0.06l0.1,0.04c0.05,0.02,0.11,0.04,0.16,0.07l0.09,0.04c0.07,0.03,0.15,0.06,0.22,0.08 l0.03,0.01l0.01,0c0.08,0.03,0.16,0.06,0.25,0.09l0.08,0.03c0.06,0.02,0.11,0.04,0.17,0.06l0.09,0.03 c0.06,0.02,0.12,0.03,0.17,0.05l0.09,0.03l0.16,0.04l0.11,0.03c0.06,0.01,0.12,0.03,0.17,0.04l0.09,0.02 c0.06,0.01,0.12,0.03,0.19,0.04l0.09,0.02c0.08,0.02,0.15,0.03,0.23,0.04l0.03,0.01l0,0c0.09,0.02,0.18,0.03,0.26,0.04l0.11,0.02 c0.05,0.01,0.11,0.02,0.16,0.02l0.11,0.01L18.16,71.25L18.16,71.25z M10.99,60.95l-2.59-0.05l-2.3-0.04L5.07,64.7l4.01,2.88 l9.76,1.6l1.53,0.25l6.97,1.14l0,0l1.82,0.3l7.16,1.17v0l6.15,1.01c0.31-0.52,0.81-2.59,1.04-3.07l0.01-0.04l-7.83-2.16l-4.79-1.32 l-15.48-4.27l-3.46-0.96L10.99,60.95L10.99,60.95z M95.07,26c-1.29,0.9-2.8,1.94-3.08,3.11c-0.13,0.54-0.16,0.82-0.08,0.96 c0.09,0.18,0.41,0.42,0.9,0.78l3.06,2.25c1.12,0.82,2.13,1.32,2.9,1.37c0.21,0.01,0.39-0.01,0.54-0.08 c0.14-0.06,0.27-0.18,0.39-0.34c0.35-0.48,0.59-1.31,0.66-2.56l0-0.01V27.5c0-1.07-0.13-1.9-0.37-2.49 c-0.17-0.42-0.4-0.7-0.66-0.83c-0.26-0.13-0.62-0.14-1.07-0.03c-0.64,0.16-1.4,0.56-2.26,1.2C95.71,25.56,95.4,25.77,95.07,26 L95.07,26z M82.56,32l-0.11-2.51c-1.3-1.04-2.7-1.79-4.18-2.29c-1.63-0.56-3.33-0.83-5.09-0.86c-2.97-0.06-5.73,0.4-8.35,1.28 c-2.64,0.88-5.15,2.19-7.6,3.83c-0.89,0.59-1.77,1.23-2.64,1.91c-0.7,0.54-1.37,1.09-2.01,1.66l0.22,1.14l0.65,2.74l24.76,0.09 c0.03,0,0.07,0,0.1,0v0c0.66,0.06,1.23,0.02,1.72-0.11c0.44-0.13,0.82-0.34,1.13-0.62c1.6-1.46,1.5-3.96,1.41-6.14L82.56,32 L82.56,32z M45.76,46.19l9.51-0.13c0.69-0.01,1.34,0.58,1.26,1.26l-0.71,6.13c-0.08,0.69-0.57,1.26-1.26,1.26h-6.01 c-0.69,0-0.97-0.63-1.26-1.26l-2.8-6C44.2,46.82,45.06,46.2,45.76,46.19L45.76,46.19z M68.06,45.43h8.6c0.69,0,1.42,0.59,1.26,1.26 l-1.82,7.74c-0.16,0.67-0.57,1.26-1.26,1.26h-6.01c-0.69,0-1.19-0.57-1.26-1.26l-0.78-7.74C66.73,46,67.37,45.43,68.06,45.43 L68.06,45.43z M14.37,68.44l-3.09,1.68L14.37,68.44L14.37,68.44z M18.06,69.05l0.78,0.13L18.06,69.05L18.06,69.05z M29.1,58.03 c-1.84-2.74-4.82-4.65-8.26-5.06l-0.27,7.19c0.81,0.21,1.53,0.63,2.1,1.2l0,0l0.04,0.04L29.1,58.03L29.1,58.03z M11.98,73.38 c0.03,0.03,0.06,0.05,0.09,0.08L11.98,73.38L11.98,73.38z M104.11,60.01l0.28-7.3c-3.63,0.08-6.85,1.8-8.96,4.45l6.45,4.06 C102.48,60.62,103.25,60.2,104.11,60.01L104.11,60.01z M106.54,52.85l-0.27,7.2c0.8,0.21,1.53,0.63,2.1,1.2l0,0l0,0l0,0l0.04,0.04 l6.12-3.23C112.76,55.34,109.89,53.39,106.54,52.85L106.54,52.85z M115.54,59.98l-6.02,3.18c0.13,0.43,0.21,0.89,0.21,1.36 c0,0.42-0.05,0.82-0.16,1.2l5.8,3.65c0.68-1.49,1.06-3.15,1.06-4.89C116.43,62.89,116.12,61.37,115.54,59.98L115.54,59.98z M114.29,71.25l-5.76-3.63c-0.05,0.06-0.11,0.11-0.16,0.17c-0.62,0.62-1.4,1.06-2.28,1.25l-0.18,7.15 C109.37,75.83,112.39,73.96,114.29,71.25L114.29,71.25z M103.75,76.22l0.18-7.23c-0.8-0.21-1.52-0.63-2.09-1.2 c-0.08-0.09-0.17-0.17-0.24-0.26l-6.65,3.62C96.9,74,100.09,75.95,103.75,76.22L103.75,76.22z M93.89,69.26l6.72-3.66 c-0.08-0.35-0.13-0.71-0.13-1.08c0-0.52,0.09-1.02,0.24-1.48l-6.48-4.08c-0.88,1.65-1.37,3.52-1.37,5.52 C92.88,66.18,93.24,67.8,93.89,69.26L93.89,69.26z M106.96,62.66c-0.47-0.47-1.13-0.76-1.86-0.76c-0.73,0-1.38,0.29-1.86,0.77 c-0.12,0.12-0.23,0.25-0.32,0.39c-0.01,0.02-0.02,0.04-0.04,0.06c-0.01,0.02-0.03,0.04-0.04,0.06c-0.23,0.39-0.36,0.85-0.36,1.33 c0,0.73,0.29,1.38,0.77,1.86c0.47,0.47,1.13,0.77,1.86,0.77c0.72,0,1.38-0.29,1.86-0.77c0.14-0.14,0.26-0.29,0.36-0.45 c0.03-0.09,0.07-0.18,0.12-0.27c0.02-0.04,0.05-0.07,0.07-0.1c0.14-0.32,0.21-0.67,0.21-1.04 C107.73,63.79,107.44,63.14,106.96,62.66L106.96,62.66L106.96,62.66z',
    viewBox: { width: 122.88, height: 82.71 },
  },
  truck: {
    // https://uxwing.com/truck-icon/ -- side view, not rotated with heading
    path: 'M78.29,23.33h18.44c5.52,0,4.23-0.66,7.33,3.93l15.53,22.97c3.25,4.81,3.3,3.77,3.3,9.54v18.99 c0,6.15-5.03,11.19-11.19,11.19h-2.28c0.2-0.99,0.3-2.02,0.3-3.07c0-8.77-7.11-15.89-15.89-15.89c-8.77,0-15.89,7.11-15.89,15.89 c0,1.05,0.1,2.07,0.3,3.07H58.14c0.19-0.99,0.3-2.02,0.3-3.07c0-8.77-7.11-15.89-15.89-15.89c-8.77,0-15.89,7.11-15.89,15.89 c0,1.05,0.1,2.07,0.3,3.07h-2.65c-5.66,0-10.29-4.63-10.29-10.29V63.05h64.27V23.33L78.29,23.33z M93.82,74.39 c6.89,0,12.48,5.59,12.48,12.49c0,6.89-5.59,12.48-12.48,12.48c-6.9,0-12.49-5.59-12.49-12.48C81.33,79.98,86.92,74.39,93.82,74.39 L93.82,74.39z M42.54,74.39c6.9,0,12.49,5.59,12.49,12.49c0,6.89-5.59,12.48-12.49,12.48c-6.89,0-12.48-5.59-12.48-12.48 C30.06,79.98,35.65,74.39,42.54,74.39L42.54,74.39z M42.54,83.18c2.04,0,3.7,1.65,3.7,3.7c0,2.04-1.65,3.69-3.7,3.69 c-2.04,0-3.69-1.66-3.69-3.69C38.85,84.83,40.51,83.18,42.54,83.18L42.54,83.18z M93.82,83.09c2.09,0,3.79,1.7,3.79,3.79 c0,2.09-1.7,3.79-3.79,3.79c-2.09,0-3.79-1.7-3.79-3.79C90.03,84.78,91.73,83.09,93.82,83.09L93.82,83.09z M89.01,32.35h3.55 l15.16,21.12v6.14c0,1.49-1.22,2.71-2.71,2.71h-16c-1.53,0-2.77-1.25-2.77-2.77V35.13C86.23,33.6,87.48,32.35,89.01,32.35 L89.01,32.35z M5.6,0h64.26c3.08,0,5.6,2.52,5.6,5.6v48.92c0,3.08-2.52,5.6-5.6,5.6H5.6c-3.08,0-5.6-2.52-5.6-5.6V5.6 C0,2.52,2.52,0,5.6,0L5.6,0z',
    viewBox: { width: 122.88, height: 99.36 },
  },
};

// 'car' and 'drone' are genuine top-down views -- the only shapes where rotating the icon with
// heading reads correctly. See MARKER_SVG_ICONS' comment for why motorcycle/truck don't qualify.
const MARKER_ROTATING_SHAPES = new Set(['car', 'drone']);

/**
 * Draws the current-position marker's icon for a non-circle `marker-shape` onto an offscreen
 * canvas and returns it as ImageData for `map.addImage()`. 'circle' never reaches here -- it
 * stays a MapLibre `circle` layer (applyMarkerStyle), which is cheaper and keeps the pulse halo.
 * Matches the circle layer's own white-stroke convention (`circle-stroke-color: #ffffff`) so
 * switching shapes doesn't also change the marker's general look.
 */
function renderMarkerShapeIcon(shape: string, color: string, radius: number): ImageData | null {
  // Padding leaves room for the stroke and (for 'pin') the point below the anchor circle.
  const strokeWidth = 2;
  const padding = strokeWidth + 2;
  const svgIcon = MARKER_SVG_ICONS[shape];

  let width: number;
  let height: number;
  const pinHeight = Math.ceil(radius * 1.6);
  if (shape === 'pin') {
    width = Math.ceil(radius * 2 + padding * 2);
    height = width + pinHeight;
  } else if (svgIcon) {
    const drawWidth = radius * 2.3;
    width = Math.ceil(drawWidth + padding * 2);
    height = Math.ceil(drawWidth * (svgIcon.viewBox.height / svgIcon.viewBox.width) + padding * 2);
  } else {
    width = height = Math.ceil(radius * 2 + padding * 2);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const centerX = width / 2;
  // 'pin' centers its circle part in the top `width x width` square, leaving pinHeight of
  // extra canvas below for the point -- every other shape centers in the full canvas.
  const centerY = shape === 'pin' ? width / 2 : height / 2;

  ctx.fillStyle = color;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = strokeWidth;

  if (svgIcon) {
    const scale = (width - padding * 2) / svgIcon.viewBox.width;
    const path = new Path2D(svgIcon.path);
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(scale, scale);
    ctx.translate(-svgIcon.viewBox.width / 2, -svgIcon.viewBox.height / 2);
    ctx.lineWidth = strokeWidth / scale; // compensate stroke width for the scale transform
    ctx.fill(path);
    ctx.stroke(path);
    ctx.restore();
  } else if (shape === 'square') {
    const half = radius * 0.85; // visually balances against the circle marker's footprint
    const corner = half * 0.35;
    ctx.beginPath();
    // roundRect isn't in every supported canvas typing target -- draw the rounded square by hand.
    ctx.moveTo(centerX - half + corner, centerY - half);
    ctx.arcTo(centerX + half, centerY - half, centerX + half, centerY + half, corner);
    ctx.arcTo(centerX + half, centerY + half, centerX - half, centerY + half, corner);
    ctx.arcTo(centerX - half, centerY + half, centerX - half, centerY - half, corner);
    ctx.arcTo(centerX - half, centerY - half, centerX + half, centerY - half, corner);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (shape === 'pin') {
    const tipY = centerY + pinHeight;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, Math.PI * 0.15, Math.PI * 0.85, true);
    ctx.lineTo(centerX, tipY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    // Unknown marker-shape value: fall back to a plain circle rather than an empty icon.
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// Inject minimal MapLibre popup styles once per page load so the popup renders
// correctly without requiring the consumer to import maplibre-gl/dist/maplibre-gl.css.
let _maplibrePopupStyleInjected = false;
function injectMaplibrePopupStyle() {
  if (_maplibrePopupStyleInjected || typeof document === 'undefined') return;
  _maplibrePopupStyleInjected = true;
  const styleElement = document.createElement('style');
  styleElement.textContent = `
    .maplibregl-popup { position:absolute; top:0; left:0; display:flex; will-change:transform; pointer-events:none; }
    .maplibregl-popup-anchor-bottom,.maplibregl-popup-anchor-bottom-left,.maplibregl-popup-anchor-bottom-right { flex-direction:column-reverse; align-items:center; }
    .maplibregl-popup-anchor-top,.maplibregl-popup-anchor-top-left,.maplibregl-popup-anchor-top-right { flex-direction:column; align-items:center; }
    .maplibregl-popup-anchor-left { flex-direction:row-reverse; align-items:center; }
    .maplibregl-popup-anchor-right { flex-direction:row; align-items:center; }
    .maplibregl-popup-tip { width:0; height:0; border:10px solid transparent; pointer-events:none; }
    .maplibregl-popup-anchor-bottom .maplibregl-popup-tip,.maplibregl-popup-anchor-bottom-left .maplibregl-popup-tip,.maplibregl-popup-anchor-bottom-right .maplibregl-popup-tip { border-top-color:var(--yoyo-card-bg,#fff); border-bottom:none; }
    .maplibregl-popup-anchor-top .maplibregl-popup-tip,.maplibregl-popup-anchor-top-left .maplibregl-popup-tip,.maplibregl-popup-anchor-top-right .maplibregl-popup-tip { border-bottom-color:var(--yoyo-card-bg,#fff); border-top:none; }
    .maplibregl-popup-anchor-left .maplibregl-popup-tip { border-right-color:var(--yoyo-card-bg,#fff); border-left:none; }
    .maplibregl-popup-anchor-right .maplibregl-popup-tip { border-left-color:var(--yoyo-card-bg,#fff); border-right:none; }
    .maplibregl-popup-content { position:relative; pointer-events:auto; background:var(--yoyo-card-bg,#fff); color:var(--yoyo-foreground,#111); border-radius:8px; padding:12px 14px 10px; box-shadow:0 2px 14px rgba(0,0,0,0.18); }
    .maplibregl-popup-close-button { position:absolute; right:6px; top:4px; cursor:pointer; font-size:18px; background:none; border:none; color:var(--yoyo-muted,#888); line-height:1; padding:2px 4px; }
    .maplibregl-popup-close-button:hover { color:var(--yoyo-foreground,#333); }
  `;
  document.head.appendChild(styleElement);
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
