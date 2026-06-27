import mqtt, { type IClientOptions, type MqttClient } from 'mqtt';

type MessageHandler = (payload: Record<string, any>) => void;

export class IjeMqttManager {
  // Keyed by topic — components subscribe/unsubscribe via these Sets
  readonly subscriptions = new Map<string, Set<MessageHandler>>();

  private client: MqttClient | null = null;
  private debug = false;

  setDebug(enabled: boolean): void {
    this.debug = enabled;
  }

  subscribe(topic: string, handler: MessageHandler): void {
    let handlers = this.subscriptions.get(topic);
    const isNewTopic = !handlers;
    if (!handlers) {
      handlers = new Set();
      this.subscriptions.set(topic, handlers);
    }
    handlers.add(handler);

    // Components routinely subscribe before connect() runs (custom elements
    // upgrade on page load, init() happens later). When that's the case we only
    // register locally here — the 'connect' handler resubscribes every known
    // topic at the broker. If we're already live, subscribe the new topic now.
    if (isNewTopic && this.client?.connected) {
      this.brokerSubscribe(topic);
    }
  }

  unsubscribe(topic: string, handler: MessageHandler): void {
    const handlers = this.subscriptions.get(topic);
    if (!handlers) return;

    handlers.delete(handler);

    // Once nothing on the page cares about a topic, stop receiving it.
    if (handlers.size === 0) {
      this.subscriptions.delete(topic);
      this.client?.unsubscribe(topic);
    }
  }

  // Dispatches a message to all subscribers of a topic — used by the real MQTT
  // client (see the 'message' handler in connect) and by the demo mock loop to
  // inject synthetic payloads.
  dispatch(topic: string, payload: Record<string, any>): void {
    if (this.debug) {
      const count = this.subscriptions.get(topic)?.size ?? 0;
      console.log(`[Yoyo ije][MQTT dispatch] ${topic} → ${count} handler(s)`);
    }
    this.subscriptions.get(topic)?.forEach(h => h(payload));
  }

  connect(url: string, token: string): void {
    // Idempotent — init() may run more than once and components must not each
    // open their own socket.
    if (this.client) return;

    const options: IClientOptions = {
      // Matches the production frontend connect path (yoyo-frontend
      // lib/mqtt/mqtt.service.ts): the session JWT is sent as the MQTT
      // username and the password is the static string 'any'.
      username: token,
      password: 'any',
      // Intentionally do not force protocolVersion — the broker negotiates it.
      // The proven frontend path leaves this unset (mqtt.js default 3.1.1);
      // forcing v5 risks rejected connections on a 3.1.1-configured broker.
      reconnectPeriod: 1000,
      connectTimeout: 30_000,
      clean: true,
    };

    let client: MqttClient;
    try {
      client = mqtt.connect(url, options);
    } catch (err) {
      console.error('[Yoyo ije] MQTT connection failed to start:', err);
      return;
    }
    this.client = client;

    client.on('connect', () => {
      console.log(`[Yoyo ije] MQTT connected (${url})`);
      // (Re)subscribe to every topic a component has registered interest in.
      // Covers both the initial connect and any reconnect after a drop.
      for (const topic of this.subscriptions.keys()) {
        this.brokerSubscribe(topic);
      }
    });

    client.on('message', (topic: string, message: Uint8Array) => {
      const payload = this.parsePayload(message);
      if (this.debug) {
        console.log('[Yoyo ije][MQTT]', topic, payload ?? `<unparseable: ${new TextDecoder().decode(message)}>`);
      }
      if (payload) this.dispatch(topic, payload);
    });

    client.on('error', err => console.error('[Yoyo ije] MQTT error:', err.message));
    client.on('offline', () => console.warn('[Yoyo ije] MQTT offline — will retry'));
  }

  disconnect(): void {
    this.client?.end(true);
    this.client = null;
  }

  private brokerSubscribe(topic: string): void {
    this.client?.subscribe(topic, { qos: 0 }, err => {
      if (err) {
        console.error(`[Yoyo ije] Failed to subscribe to ${topic}:`, err.message);
      } else if (this.debug) {
        console.log(`[Yoyo ije][MQTT] subscribed ✓ ${topic}`);
      }
    });
  }

  // Device payloads are JSON. The backend wraps device data in a single-element
  // array ([{...}]); unwrap it so widgets always receive a plain object.
  private parsePayload(message: Uint8Array): Record<string, any> | null {
    let text: string;
    try {
      text = new TextDecoder().decode(message);
    } catch {
      return null;
    }

    if (!text) return null;

    try {
      const parsed = JSON.parse(text);
      const obj = Array.isArray(parsed) ? parsed[0] : parsed;
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        return obj as Record<string, any>;
      }
      console.warn('[Yoyo ije] Ignoring non-object MQTT payload');
      return null;
    } catch {
      console.warn('[Yoyo ije] Ignoring malformed MQTT payload');
      return null;
    }
  }
}
