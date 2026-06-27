<p align="center">
  <img src="https://raw.githubusercontent.com/Yoyo-MQ/yoyo/main/packages/sdk/assets/yoyo.svg" width="56" height="56" alt="Yoyo" />
</p>

<h1 align="center">@yoyomq/ije-react</h1>

<p align="center">React wrappers for the Ije SDK by <strong>Yoyo</strong>.</p>

---

> ⚠️ **Placeholder — not yet implemented.** This package currently exports
> nothing. First-class, typed React components are planned.

In the meantime, the [`@yoyomq/ije-ui`](../ui) Web Components work inside React
directly — initialize once and use the tags as JSX:

```tsx
import { useEffect } from 'react';
import { Ije } from '@yoyomq/ije-core';
import '@yoyomq/ije-ui';

export function Dashboard({ apiKey }: { apiKey: string }) {
  useEffect(() => { Ije.init({ apiKey }); }, [apiKey]);
  return <ije-map-tracker device-id="truck-001" title="Vehicle Location" />;
}
```

📖 **Full documentation:** see the [Ije SDK README](../../README.md), including the
[Using with React](../../README.md#using-with-react) section.
