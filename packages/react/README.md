<p align="center">
  <img src="https://raw.githubusercontent.com/Yoyo-MQ/ije/main/assets/yoyo.svg" width="56" height="56" alt="Yoyo" />
</p>

<h1 align="center">@yoyomq/ije-react</h1>

<p align="center">First-class React components for the Ije SDK by <strong>Yoyo</strong>.</p>

---

## Get your API key

1. Sign in at [yoyomq.com](https://yoyomq.com)
2. Go to **Settings → API Keys**
3. Create a new key and copy it

## Installation

```bash
npm install @yoyomq/ije-react
```

React 16.8+ is required as a peer dependency.

## Quick start

Wrap your app (or the relevant subtree) with `IjeProvider`, then drop in any component:

```tsx
import { IjeProvider, MapTracker, TelemetryStat } from '@yoyomq/ije-react';

export default function App() {
  return (
    <IjeProvider config={{ apiKey: 'YOUR_YOYO_API_KEY' }}>
      <MapTracker deviceId={1001} title="Vehicle Location" />
      <TelemetryStat deviceId={1001} metric="speed" title="Speed" unit="km/h" />
    </IjeProvider>
  );
}
```

## Next.js App Router

All components include `'use client'` — no extra setup needed. Place `IjeProvider` in a client boundary:

```tsx
// app/dashboard/layout.tsx
import { IjeProvider } from '@yoyomq/ije-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <IjeProvider config={{ apiKey: process.env.NEXT_PUBLIC_YOYO_API_KEY! }}>
      {children}
    </IjeProvider>
  );
}
```

## Components

### `<MapTracker>`

Live map showing a device's current position and movement trail. Click the position marker to open an info bubble with speed, heading, altitude, coordinates, and timestamp. Optionally enables historical trip replay mode.

```tsx
<MapTracker
  deviceId={1001}
  title="Vehicle Location"
  width="100%"
  height="400px"
/>
```

| Prop | Type | Description |
|------|------|-------------|
| `deviceId` | `number` | **Required.** Numeric device ID |
| `title` | `string` | Card title |
| `helpMessage` | `string` | Tooltip shown on hover |
| `width` | `string` | CSS width (default `100%`) |
| `height` | `string` | CSS height (default `400px`) |
| `tripPicker` | `boolean` | Enable historical trip replay mode |
| `triggerId` | `number` | Trip trigger ID (trip-picker mode) |
| `triggerName` | `string` | Trip trigger label (trip-picker mode) |
| `startsAt` | `number` | Trip start Unix timestamp in seconds (trip-picker mode) |
| `endsAt` | `number` | Trip end Unix timestamp in seconds (trip-picker mode) |

### `<TelemetryStat>`

Single live telemetry value (speed, fuel, temperature, etc.).

```tsx
<TelemetryStat deviceId={1001} metric="speed" title="Speed" unit="km/h" />
```

| Prop | Type | Description |
|------|------|-------------|
| `deviceId` | `number` | **Required.** Numeric device ID |
| `metric` | `string` | **Required.** Telemetry field name |
| `title` | `string` | Card title |
| `unit` | `string` | Unit label (e.g. `km/h`, `°C`) |
| `helpMessage` | `string` | Tooltip shown on hover |

### `<TelemetryChart>`

Live time-series chart for a telemetry metric.

```tsx
<TelemetryChart deviceId={1001} metric="speed" title="Speed over time" height="200px" />
```

| Prop | Type | Description |
|------|------|-------------|
| `deviceId` | `number` | **Required.** Numeric device ID |
| `metric` | `string` | Telemetry field name |
| `title` | `string` | Card title |
| `helpMessage` | `string` | Tooltip shown on hover |
| `width` | `string` | CSS width |
| `height` | `string` | CSS height |

### `<AggregateStat>`

Displays a set of aggregate metrics (totals, averages, counts) passed in as data.

```tsx
import type { AggregateData } from '@yoyomq/ije-react';

const data: AggregateData = {
  metrics: [
    { label: 'Total distance', value: 1240, unit: 'km' },
    { label: 'Trips', value: 38 },
  ],
};

<AggregateStat data={data} />
```

| Prop | Type | Description |
|------|------|-------------|
| `data` | `AggregateData` | Metrics to display |
| `loading` | `boolean` | Show loading skeleton |

### `<BarChart>`

Horizontal bar chart for comparing values across categories.

```tsx
import type { BarChartData } from '@yoyomq/ije-react';

const data: BarChartData[] = [
  { label: 'Mon', value: 120 },
  { label: 'Tue', value: 95 },
];

<BarChart data={data} height="200px" />
```

| Prop | Type | Description |
|------|------|-------------|
| `data` | `BarChartData[]` | Array of `{ label, value }` entries |
| `loading` | `boolean` | Show loading skeleton |
| `height` | `string` | CSS height |

### `<Chat>`

AI-powered fleet assistant chat widget.

```tsx
<Chat title="Fleet Assistant" placeholder="Ask about your fleet…" />
```

| Prop | Type | Description |
|------|------|-------------|
| `title` | `string` | Widget title |
| `placeholder` | `string` | Input placeholder text |
| `width` | `string` | CSS width |
| `height` | `string` | CSS height |

## `IjeProvider`

Initializes the SDK once. Place it high in your component tree.

```tsx
<IjeProvider config={{ apiKey: 'YOUR_YOYO_API_KEY' }}>
  {children}
</IjeProvider>
```

The `config` prop accepts a [`SdkConfig`](https://github.com/Yoyo-MQ/ije) object from `@yoyomq/ije-core`.

---

📖 **Full SDK documentation:** [github.com/Yoyo-MQ/ije](https://github.com/Yoyo-MQ/ije)
