<p align="center">
  <img src="https://raw.githubusercontent.com/Yoyo-MQ/ije/main/assets/yoyo.svg" width="56" height="56" alt="Yoyo" />
</p>

<h1 align="center">@yoyomq/ije-ui</h1>

<p align="center">Drop-in dashboard Web Components for the Ije SDK by <strong>Yoyo</strong>.</p>

---

Importing this package registers a set of framework-agnostic custom elements. Pair
it with [`@yoyomq/ije-core`](../core) for configuration and live data.

```ts
import { Ije } from '@yoyomq/ije-core';
import '@yoyomq/ije-ui'; // registers all <ije-*> elements

await Ije.init({ apiKey: 'YOUR_YOYO_API_KEY' });
```

```html
<ije-map-tracker   device-id="truck-001" height="500px"></ije-map-tracker>
<ije-telemetry-stat  device-id="truck-001" metric="speed" unit="MPH"></ije-telemetry-stat>
<ije-telemetry-chart device-id="truck-001" metric="speed" height="200px"></ije-telemetry-chart>
<ije-chat></ije-chat>
```

### Elements

| Tag | Description |
|-----|-------------|
| `<ije-map-tracker>` | Live location map with trail (MapLibre) |
| `<ije-telemetry-stat>` | Single live metric value |
| `<ije-telemetry-chart>` | Live time-series chart (uPlot) |
| `<ije-chat>` | Fleet assistant chat |
| `<ije-aggregate-stat>` | Static multi-metric card (data you supply) |
| `<ije-bar-chart>` | Static bar chart (data you supply) |

Every widget renders a subtle **“Powered by Yoyo”** footer.

📖 **Full documentation** — attributes, theming, and data contracts: see the
[Ije SDK README](../../README.md).
