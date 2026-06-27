<p align="center">
  <img src="https://raw.githubusercontent.com/Yoyo-MQ/yoyo/main/packages/sdk/assets/yoyo.svg" width="72" height="72" alt="Yoyo" />
</p>

<h1 align="center">Ije — Yoyo Embeddable SDK</h1>

<p align="center">Drop-in live IoT dashboards, <strong>Powered by Yoyo</strong>.</p>

---

Ije is Yoyo's drop-in SDK for embedding live IoT dashboards into any web page. It
ships a set of framework-agnostic **custom elements** (Web Components) — a live
map tracker, telemetry stats and charts, and a fleet chat assistant — backed by a
small **core** runtime that handles auth, theming, the real-time MQTT connection,
and the insights API.

No build step or framework is required: initialize the SDK with your API key, drop a
tag like `<ije-map-tracker device-id="…">` into your HTML, and it starts
streaming.

---

## Get your API key

An API key is required to use Ije. Sign in to your [Yoyo](https://yoyomq.com)
account and generate a key from **Settings → API Keys**. Keep it secret — treat it
like a password.

---

## Packages

| Package | Install name | What it is |
|---------|--------------|------------|
| Core    | `@yoyomq/ije-core` | Runtime singleton (`Ije`): init, config/theme, MQTT, chat API |
| UI      | `@yoyomq/ije-ui`   | The custom elements (`<ije-*>`). Importing it registers them. |
| React   | `@yoyomq/ije-react`| Thin React wrappers — **placeholder, not yet implemented** |

> The React package currently has no exports. Use the Web Components directly —
> they work inside React too (see [Using with React](#using-with-react)).

---

## Installation

```bash
pnpm add @yoyomq/ije-core @yoyomq/ije-ui
# or: npm install / yarn add
```

The UI package pulls in `maplibre-gl` (map rendering) and `uplot` (charts) as
dependencies; no extra setup needed.

---

## Quick start

```ts
import { Ije } from '@yoyomq/ije-core';
import '@yoyomq/ije-ui'; // registers all <ije-*> custom elements

await Ije.init({
  apiKey: 'YOUR_YOYO_API_KEY',
  theme: { primaryColor: '#8A2BE2' },
});
```

```html
<!-- Live map that follows a device -->
<ije-map-tracker device-id="truck-001" title="Vehicle Location" height="500px"></ije-map-tracker>

<!-- A live metric and a live chart -->
<ije-telemetry-stat  device-id="truck-001" metric="speed"   title="Velocity" unit="MPH"></ije-telemetry-stat>
<ije-telemetry-chart device-id="truck-001" metric="speed"   title="Speed"    height="200px"></ije-telemetry-chart>

<!-- Natural-language fleet assistant -->
<ije-chat title="Fleet Assistant" height="520px"></ije-chat>
```

Calling `Ije.init()` opens the real-time MQTT connection and any `<ije-*>` widget
already on the page begins receiving data. Widgets can be placed before or after
`init()` runs — they buffer their subscriptions and attach on connect.

---

## Configuration

`Ije.init(config)` accepts:

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `apiKey` | ✅ | — | Your Yoyo API key. Sent as the `YOYO_API_KEY` header for all API calls and as the MQTT credential for live data streams. Get one from [Yoyo](https://yoyomq.com). |
| `apiUrl` | | `https://api.yoyomq.com` | Base URL for the insights/chat API. |
| `mqttUrl` | | `wss://mqtt.yoyomq.com` | MQTT-over-WebSocket broker URL (`ws://`, `wss://`, `mqtt://`, `mqtts://`). |
| `theme` | | — | `{ primaryColor?, fontFamily?, borderRadius? }` |
| `debug` | | `false` | Log every incoming MQTT message and coordinate parse result to the console. |

`init()` is idempotent and resolves once configuration is applied. A failed MQTT
connection is **non-fatal** — it retries in the background and never rejects
`init()` or blocks the rest of your dashboard.

### Theming

Set your brand color through `theme.primaryColor` — widgets use it for map trails,
chart strokes, chat accents, etc.

The widgets also honor a set of **CSS custom properties** for surrounding colors
and typography. Define these on a parent (e.g. `:root`) to match your app's look,
especially for dark mode:

| Variable | Used for |
|----------|----------|
| `--yoyo-font` | Font family for all widgets |
| `--yoyo-foreground` | Primary text color |
| `--yoyo-muted` | Secondary/label text |
| `--yoyo-background` | Widget background |
| `--yoyo-card-bg` | Headers, chat bubbles, panels |
| `--yoyo-border` | Borders/dividers |

```css
:root {
  --yoyo-font: 'Inter', sans-serif;
  --yoyo-foreground: #18181b;
  --yoyo-muted: #71717a;
  --yoyo-background: #ffffff;
  --yoyo-card-bg: #f4f4f5;
  --yoyo-border: #e4e4e7;
}
```

---

## Components

Every widget renders a subtle **"Powered by Yoyo"** footer that inherits your
theme colors.

### `<ije-map-tracker>` — live location map

Subscribes to a device's location stream and draws a moving marker with a trail,
auto-panning to follow the device (MapLibre + OpenStreetMap tiles).

| Attribute | Description |
|-----------|-------------|
| `device-id` | Device to track (required) |
| `title` | Optional header title |
| `help-message` | Optional tooltip shown next to the title |
| `width` / `height` | CSS size (default `100%` × `400px`) |

```html
<ije-map-tracker device-id="truck-001" title="Vehicle Location" height="500px"></ije-map-tracker>
```

### `<ije-telemetry-stat>` — single live metric

Shows the latest value of one metric as a large number.

| Attribute | Description |
|-----------|-------------|
| `device-id` | Device id (required) |
| `metric` | Metric key from the telemetry payload, e.g. `speed`, `battery` (required) |
| `title` | Label (defaults to the metric name, uppercased) |
| `unit` | Optional unit suffix, e.g. `MPH`, `%` |
| `help-message` | Optional tooltip |

```html
<ije-telemetry-stat device-id="truck-001" metric="battery" title="Battery" unit="%"></ije-telemetry-stat>
```

### `<ije-telemetry-chart>` — live time-series chart

Plots a rolling window (last 100 points) of one metric over time (uPlot).

| Attribute | Description |
|-----------|-------------|
| `device-id` | Device id (required) |
| `metric` | Metric key (default `speed`) |
| `title` | Header title |
| `help-message` | Optional tooltip |
| `width` / `height` | CSS size (default `100%` × `250px`) |

```html
<ije-telemetry-chart device-id="truck-001" metric="speed" title="Speed" height="200px"></ije-telemetry-chart>
```

### `<ije-chat>` — fleet assistant

A chat UI that sends questions to the Yoyo insights API and renders the answer,
including any returned chart (bar/line/pie/scatter/table).

| Attribute | Description |
|-----------|-------------|
| `title` | Header title (default `Fleet Assistant`) |
| `placeholder` | Input placeholder |
| `width` / `height` | CSS size (default `100%` × `520px`) |

```html
<ije-chat title="Fleet Assistant" placeholder="Ask about your fleet…" height="520px"></ije-chat>
```

### `<ije-aggregate-stat>` — static multi-metric card

Driven by data you supply (not MQTT). Set the `data-json` attribute or the `.data`
property.

```html
<ije-aggregate-stat id="agg"></ije-aggregate-stat>
<script>
  document.getElementById('agg').data = {
    title: 'Telemetry throughput',
    description: 'Rows ingested in the last 24h',
    metrics: [
      { label: 'Messages', value: '1,452,000' },
      { label: 'Per hour', value: '60,500' },
      { label: 'In scope', value: '342' },
    ],
  };
</script>
```

Add `loading` (any value other than `false`) to render placeholders.

### `<ije-bar-chart>` — static bar chart

Driven by data you supply via `data-json` or `.data`.

```html
<ije-bar-chart id="bar" height="200"></ije-bar-chart>
<script>
  document.getElementById('bar').data = [
    { name: '2026-04-01', total: 120 },
    { name: '2026-04-02', total: 156 },
  ];
</script>
```

Add `loading` to render a placeholder state.

---

## Programmatic API

Everything hangs off the `Ije` singleton from `@yoyomq/ije-core`.

### Chat

```ts
const res = await Ije.chat.ask('How many devices reported in the last hour?');
console.log(res.answer);  // string
console.log(res.chart);   // optional ChatChartSpec
Ije.chat.resetSession();  // start a fresh conversation
```

`ask()` throws if the SDK isn't initialized or the request fails.

### Real-time data (MQTT)

Most apps never touch this directly — the widgets handle it. But you can subscribe
to raw streams:

```ts
Ije.mqtt.subscribe('device/truck-001/telemetry', (payload) => {
  console.log(payload.speed);
});
```

`Ije.mqtt` also exposes `unsubscribe(topic, handler)`, `dispatch(topic, payload)`
(used internally and for local mocking), and `disconnect()`.

#### Data contract

Widgets expect JSON payloads on these topics:

| Topic | Payload | Consumed by |
|-------|---------|-------------|
| `device/{deviceId}/location` | `{ "lng": number, "lat": number }` | `<ije-map-tracker>` |
| `device/{deviceId}/telemetry` | `{ "<metric>": number, "timestamp"?: number }` | `<ije-telemetry-stat>`, `<ije-telemetry-chart>` |

`timestamp` is in milliseconds; if omitted, charts use arrival time. Malformed or
out-of-range payloads are dropped rather than rendered.

---

## Using with React

The `@yoyomq/ije-react` wrappers aren't published yet, but the Web Components work in
React as-is — just initialize once and use the tags as JSX:

```tsx
import { useEffect } from 'react';
import { Ije } from '@yoyomq/ije-core';
import '@yoyomq/ije-ui';

export function Dashboard({ apiKey }: { apiKey: string }) {
  useEffect(() => { Ije.init({ apiKey }); }, [apiKey]);

  // For static-data widgets, set the .data property via a ref since
  // custom-element properties aren't plain React props.
  return <ije-map-tracker device-id="truck-001" title="Vehicle Location" />;
}
```

You may need to declare the custom element tags in your JSX intrinsic elements for
TypeScript. (First-class typed React wrappers are planned.)

---

## Local development

This is a pnpm + Turborepo monorepo.

```bash
pnpm install
pnpm build          # build all packages via turbo
```

The `apps/demo-web` app is a full working dashboard you can run for reference; it
drives the widgets with a synthetic telemetry loop via `Ije.mqtt.dispatch(...)`.
