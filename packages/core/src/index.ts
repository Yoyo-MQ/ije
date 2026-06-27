import { IjeMqttManager } from './mqttManager';
import { IjeChatClient } from './chatClient';
import { IjeTripsClient } from './tripsClient';
import { IjeHttpClient } from './httpClient';

export type { ChatChartSpec, ChatResponse } from './chatClient';
export type {
  IjeTrigger,
  IjeDevice,
  IjeAggregatedEvent,
  IjeAggregatedEventDetail,
  IjeDeviceDataPoint,
  IjeTriggersResponse,
  IjeDevicesResponse,
  IjeAggregatedEventsResponse,
  IjeDeviceDataResponse,
  ListAggregatedEventsParams,
  GetDeviceDataParams,
} from './tripsClient';
export { IjeTripsClient } from './tripsClient';
export { IjeHttpClient } from './httpClient';

export interface SdkConfig {
  /**
   * Your Yoyo API key. Used as the `YOYO_API_KEY` header for all API calls
   * and as the MQTT credential for live data streams.
   * Get one from https://yoyomq.com → Settings → API Keys.
   */
  apiKey: string;
  /**
   * Organization UUID used to build MQTT subscription topics.
   * Populated automatically by init() via GET /public/api/v1/context;
   * override only if you need to bypass that fetch.
   */
  organizationId?: string;
  theme?: {
    primaryColor?: string;
    fontFamily?: string;
    borderRadius?: string;
  };
  apiUrl?: string;
  mqttUrl?: string;
  /** When true, the SDK logs every incoming MQTT message and coordinate parse result to the console. */
  debug?: boolean;
}

export class IjeSDK {
  private static instance: IjeSDK;
  public config: SdkConfig | null = null;
  public isInitialized = false;
  public mqtt: IjeMqttManager;
  public chat: IjeChatClient;
  public trips: IjeTripsClient;
  public http: IjeHttpClient;

  private constructor() {
    this.mqtt = new IjeMqttManager();
    this.chat = new IjeChatClient();
    this.trips = new IjeTripsClient();
    this.http = new IjeHttpClient();
  }

  public static getInstance(): IjeSDK {
    if (!IjeSDK.instance) {
      IjeSDK.instance = new IjeSDK();
    }
    return IjeSDK.instance;
  }

  public async init(config: SdkConfig): Promise<void> {
    if (this.isInitialized) {
      console.warn('[Yoyo ije] SDK is already initialized');
      return;
    }

    this.config = {
      apiUrl: 'https://api.yoyomq.com',
      mqttUrl: 'wss://mqtt.yoyomq.com',
      // Strip undefined values so callers passing `mqttUrl: undefined` (e.g.
      // when an env var isn't set) don't silently clobber built-in defaults.
      ...Object.fromEntries(Object.entries(config).filter(([, v]) => v !== undefined)),
    } as SdkConfig;

    this.chat._setConfig(this.config);
    this.trips._setConfig(this.config);
    this.http._setConfig(this.config);

    // Resolve the organization UUID so UI widgets can build correct MQTT topics.
    // Non-fatal: widgets fall back to legacy topic format when not available.
    if (!this.config.organizationId) {
      try {
        const ctx = await this.http.get<{ organization_id: string }>('/public/api/v1/context');
        if (ctx.organization_id) {
          this.config.organizationId = ctx.organization_id;
        }
      } catch {
        console.warn('[Yoyo ije] Could not resolve organization ID; live tracking topic may not match');
      }
    }

    this.mqtt.setDebug(this.config.debug ?? false);

    // Open the real-time MQTT connection that backs the tracking/telemetry
    // widgets. Non-fatal: connection failures retry in the background so a
    // broker hiccup never breaks init() or the rest of the dashboard.
    if (this.config.mqttUrl) {
      this.mqtt.connect(this.config.mqttUrl, this.config.apiKey);
    }

    if (this.config.theme && typeof document !== 'undefined') {
      const root = document.documentElement;
      if (this.config.theme.primaryColor) {
        root.style.setProperty('--yoyo-primary', this.config.theme.primaryColor);
      }
    }

    this.isInitialized = true;
    console.log('[Yoyo ije] SDK initialized');
  }
}

/**
 * Access the Ije SDK by Yoyo
 */
export const Ije = IjeSDK.getInstance();
