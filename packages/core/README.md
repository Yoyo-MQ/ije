<p align="center">
  <img src="https://raw.githubusercontent.com/Yoyo-MQ/ije/main/assets/yoyo.svg" width="56" height="56" alt="Yoyo" />
</p>

<h1 align="center">@yoyomq/ije-core</h1>

<p align="center">Runtime core for the Ije SDK by <strong>Yoyo</strong>.</p>

---

This package exposes the `Ije` singleton — the runtime that powers every Ije
widget. It handles initialization, theming, the real-time MQTT connection, and the
insights/chat API.

```ts
import { Ije } from '@yoyomq/ije-core';

await Ije.init({ apiKey: 'YOUR_YOYO_API_KEY', theme: { primaryColor: '#8A2BE2' } });

// Natural-language insights
const res = await Ije.chat.ask('How many devices reported in the last hour?');

// Raw real-time streams (the UI widgets use these for you)
Ije.mqtt.subscribe('device/truck-001/telemetry', (p) => console.log(p.speed));
```

It's usually paired with [`@yoyomq/ije-ui`](../ui) for the drop-in `<ije-*>`
components.

📖 **Full documentation:** see the [Ije SDK README](../../README.md).
