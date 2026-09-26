<p align="center">
  <img src="https://raw.githubusercontent.com/Yoyo-MQ/ije/main/assets/yoyo.svg" width="72" height="72" alt="Yoyo" />
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
<ije-chat attributor-id="user-123" title="Fleet Assistant" height="520px"></ije-chat>
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
| `--yoyo-primary` | Accent color for `<ije-chat>` entity-mention links (falls back to `theme.primaryColor`) |
| `--yoyo-tag-bg` | Background for small inline tags/badges (e.g. chart help hints) |
| `--yoyo-grid-stroke` | Chart gridline color (`<ije-telemetry-chart>`) |
| `--yoyo-axis-stroke` | Chart axis line/label color (`<ije-telemetry-chart>`) |

```css
:root {
  --yoyo-font: 'Inter', sans-serif;
  --yoyo-foreground: #18181b;
  --yoyo-muted: #71717a;
  --yoyo-background: #ffffff;
  --yoyo-card-bg: #f4f4f5;
  --yoyo-border: #e4e4e7;
  --yoyo-primary: #8a2be2;
  --yoyo-tag-bg: #eeeeee;
  --yoyo-grid-stroke: rgba(0, 0, 0, 0.08);
  --yoyo-axis-stroke: #999999;
}
```

If your app already has its own light/dark design tokens, map these to them directly
(e.g. `--yoyo-foreground: hsl(var(--foreground))` for a shadcn-style HSL-triple token) —
one definition then follows your existing theme automatically, no separate dark-mode
block needed.

---

## Components

Every widget renders a subtle **"Powered by Yoyo"** footer that inherits your
theme colors.

### `<ije-map-tracker>` — live location map

Subscribes to a device's location stream and draws a moving marker with a trail,
auto-panning to follow the device (MapLibre + OpenStreetMap tiles).

| Attribute | Description |
|-----------|-------------|
| `device-id` | Device to track |
| `device-ids` | Several devices, comma separated, in place of `device-id` |
| `feed` | `mqtt` (default) or `host`: positions come only from `ingestDeviceMessage()` |
| `title` | Optional header title |
| `help-message` | Optional tooltip shown next to the title |
| `width` / `height` | CSS size (default `100%` × `400px`) |

```html
<ije-map-tracker device-id="truck-001" title="Vehicle Location" height="500px"></ije-map-tracker>
```

#### Several devices

With `device-ids`, live mode follows every listed device, each with its own trail and marker,
and picks up devices added to or removed from the list. The camera fits all devices when one
first appears, until the user pans or zooms. History mode draws one route per device, and
`setPointIndex(i)` places every device where it was at the moment of point `i`, hiding devices
that had not reported yet. Start markers and the telemetry bar are shown only for one device.

```js
const tracker = document.querySelector('ije-map-tracker');
tracker.setDeviceAppearances([
  { deviceId: 12, label: 'Scout 1', colour: '#22c55e' },
  { deviceId: 15, label: 'Relay', colour: '#3b82f6' },
]);
tracker.fitToDevices();
// Cancel the event to replace the built-in popup with your own panel.
tracker.addEventListener('ije-device-click', (event) => console.log(event.detail.deviceId));
// With feed="host": the same handling as an MQTT message for that device.
tracker.ingestDeviceMessage(12, { lat: -1.29, lng: 36.82, heading: 90 });
```

#### Fleet views

For an operations map, the tracker also takes the context devices work in, and hands the host
what it needs to anchor its own panels.

| Attribute | Description |
|-----------|-------------|
| `basemap` | `streets` (default, OpenStreetMap), or Esri's muted `dark` / `light` canvas |
| `marker-shape` | Also `arrow`, a plain heading arrow |
| `hide-live-badge` | Hides LIVE, e.g. while the host feeds simulated positions |

| Method | Description |
|--------|-------------|
| `setDeviceAppearances(…)` | Also takes `emphasis`: `selected` (white ring, filled label) or `warning` (amber ring and label) |
| `setOverlays({ areas, routes, places })` | Areas `{ id, outline, colour, lineStyle, label? }`, routes `{ id, path, colour, lineStyle }`, places `{ id, kind, position, label, colour?, badge? }` where `kind` is `alert` (haloed, with an optional badge such as "Critical") or `station` (a dock or depot). `lineStyle` is `solid` or `dashed`. Positions are `{ lat, lng }` |
| `fitToDevices(padding?, maximumZoom?)` | `padding` in pixels, or `{ top, right, bottom, left }` to keep devices clear of host panels |
| `zoomIn()` / `zoomOut()` | |
| `project({ lat, lng })` | Pixel position within the map, for anchoring a host panel to a device |

| Event | Detail |
|-------|--------|
| `ije-device-click` | `{ deviceId }`; cancel it to suppress the built-in popup |
| `ije-map-click` | A click that landed on no device |
| `ije-view-change` | Every pan or zoom frame; re-project host panels here |

In React, `IjeDeviceTrackerView` takes these as props (`deviceIds`, `feed`, `basemap`,
`overlays`, `deviceAppearances`, `hideLiveBadge`, `onDeviceClick`, `onMapClick`,
`onViewChange`), and its ref is the element.

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

A chat UI that sends questions to the Yoyo chat API and renders the answer,
including any returned chart (bar/line/pie/scatter/table) and any entity references
(devices, triggers, trips) the answer mentions.

| Attribute | Description |
|-----------|-------------|
| `attributor-id` | **Required.** Who questions are asked on behalf of: your yoyo user id, or any stable id for the person from your own system. Every action the assistant takes is recorded against it. Without it the widget shows an error instead of the chat. Equivalent to setting the `.attributorId` property. |
| `title` | Header title (default `Fleet Assistant`) |
| `placeholder` | Input placeholder |
| `width` / `height` | CSS size (default `100%` × `520px`) |
| `resource-link-resolvers` | JSON string mapping entity type → URL template. Equivalent to setting the `.resourceLinkResolvers` property. See [Entity links](#entity-links-in-chat-responses) below. |

```html
<ije-chat attributor-id="user-123" title="Fleet Assistant" placeholder="Ask about your fleet…" height="520px"></ije-chat>
```

#### Entity links in chat responses

An answer can reference specific devices, triggers, trips, or workflows. By default
these render as plain text with an inline detail popover (built from the entity
reference itself — no host cooperation or network call required). If your app has
real pages for some of these, tell `<ije-chat>` how to link to them:

```html
<script>
  document.querySelector('ije-chat').resourceLinkResolvers = {
    devices: '/devices/{id}',
    triggers: '/triggers/{id}',
    workflows: '/workflows/{id}',
    // no entry for "trips" — trip mentions keep using the built-in popover
  };
</script>
```

or, with no build step, as a JSON attribute:

```html
<ije-chat attributor-id="user-123" resource-link-resolvers='{"devices":"/devices/{id}","triggers":"/triggers/{id}"}'></ije-chat>
```

**Template placeholders.** `{field}` is replaced with the matching field from the
entity reference — field names are the raw ones on `EntityReference` (snake_case,
`device_id` not `deviceId`), not a camelCased version. Every currently-supported
entity type and its fields:

| Type | Fields | Example template |
|------|--------|-------------------|
| `devices` | `id` | `/devices/{id}` |
| `triggers` | `id` | `/triggers/{id}` |
| `trips` | `id`, `device_id` | `/devices/{device_id}/playback?trip={id}` |
| `workflows` | `id` | `/workflows/{id}` |

Leave a type out of `resourceLinkResolvers` (or omit the prop entirely) and it falls
back to the popover — never a broken link. Ije, not the LLM, owns this list; the
Anthropic-side agent only ever returns entity references drawn from it, so a template
here can't go stale from a model change.

**Handling clicks in a single-page app.** A resolved entity mention is rendered as a
clickable `<span>`, not a real `<a href>` — right-click "open in new tab" isn't
available. Clicking it dispatches a cancelable `ije-entity-navigate` `CustomEvent`
(`detail: { entity, href }`) before falling back to `window.location.href`. Call
`preventDefault()` to take over with your own router instead:

```ts
document.querySelector('ije-chat').addEventListener('ije-entity-navigate', (e) => {
  e.preventDefault();
  router.push(e.detail.href); // client-side nav, no full page reload
});
```

Hosts that never configure `resourceLinkResolvers` or this listener still get a fully
working experience — just via the popover and plain navigation instead of an SPA-aware
one.

**Knowing when a conversation changes.** Every successful `ask()` (typed or
programmatic) dispatches `ije-conversation-updated` (`detail: { sessionId }`). Use it to
invalidate a conversation list you're caching elsewhere (e.g. a React Query list), since
the widget itself has no reason to know that list exists:

```ts
document.querySelector('ije-chat').addEventListener('ije-conversation-updated', () => {
  queryClient.invalidateQueries({ queryKey: mimirConversationsQueryKeys.lists() });
});
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
// The second argument is the attributor id: who you're asking on behalf of (see <ije-chat>'s attributor-id).
const res = await Ije.chat.new('How many devices reported in the last hour?', 'user-123');
// Follow up in that same conversation:
const followUp = await Ije.chat.reply('Which of them were idle?', 'user-123');
console.log(res.answer);    // string
console.log(res.chart);     // optional ChatChartSpec
console.log(res.entity_references); // EntityReference[] — devices/triggers/trips the answer mentions,
                             // resolved to links by <ije-chat> if you're using the widget;
                             // resolve them yourself here if you're driving the chat UI by hand
Ije.chat.resetSession();  // forget the conversation in progress, so reply() has nothing to continue
```

`new()` and `reply()` throw if the SDK isn't initialized or the request fails; `reply()` also throws when no conversation is in progress.

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

`@yoyomq/ije-react` publishes typed wrappers — `IjeProvider` once at the root, then the
components as JSX:

```tsx
import { IjeProvider, IjeMapTracker } from '@yoyomq/ije-react';

export function Dashboard({ apiKey }: { apiKey: string }) {
  return (
    <IjeProvider config={{ apiKey }}>
      <IjeMapTracker deviceId="truck-001" title="Vehicle Location" />
    </IjeProvider>
  );
}
```

`IjeChat` forwards a ref to the underlying `<ije-chat>` element for the cases a prop
can't cover — driving it from outside instead of through its own composer:

```tsx
import { useRef } from 'react';
import { IjeChat, type IjeChatHandle } from '@yoyomq/ije-react';

function FleetAssistantPanel() {
  const chatRef = useRef<IjeChatHandle>(null);

  // Ask on the user's behalf, e.g. a contextual "Ask about this" button elsewhere on the page.
  chatRef.current?.ask('Why is TRK-1150 idle?');

  // Restore a past conversation (see "Conversation history" above) and its entity links.
  const { messages } = await Ije.chat.getConversation(sessionId);
  Ije.chat.resumeSession(sessionId);
  chatRef.current?.loadHistory(messages);

  // Or listen for the same ije-entity-navigate event documented above.
  chatRef.current?.addEventListener('ije-entity-navigate', (e) => { /* ... */ });

  return <IjeChat ref={chatRef} attributorId={currentUser.id} />;
}
```

If you're not using the React wrappers, the Web Components work in plain React too —
initialize `Ije` once and use the tags as JSX, declaring them in your JSX intrinsic
elements for TypeScript.

---

## Local development

This is a pnpm + Turborepo monorepo.

```bash
pnpm install
pnpm build          # build all packages via turbo
```

The `apps/demo-web` app is a full working dashboard you can run for reference; it
drives the widgets with a synthetic telemetry loop via `Ije.mqtt.dispatch(...)`.
