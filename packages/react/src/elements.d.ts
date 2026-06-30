import type { HTMLAttributes } from 'react';

type El = HTMLAttributes<HTMLElement>;

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'ije-map-tracker':     El & { [k: string]: any };
      'ije-telemetry-stat':  El & { [k: string]: any };
      'ije-telemetry-chart': El & { [k: string]: any };
      'ije-chat':            El & { [k: string]: any };
      'ije-aggregate-stat':  El & { [k: string]: any };
      'ije-bar-chart':       El & { [k: string]: any };
    }
  }
}
