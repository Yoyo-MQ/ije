'use client';

import { forwardRef, useRef, useImperativeHandle } from 'react';
import type { IjeMapTracker } from '@yoyomq/ije-ui';

export interface IjeDeviceTrackerViewProps {
  deviceId: number;
  title?: string;
  helpMessage?: string;
  width?: string;
  height?: string;
  /** Event-picker mode: pass trigger-id + optional trigger-name to step through one trigger's
   *  aggregated events one at a time, each with its own recorded route. */
  eventPicker?: boolean;
  triggerId?: number;
  triggerName?: string;
  /** History mode: a device's own telemetry with no trigger involved -- the widget fetches and
   *  plots it itself. `startsAt`/`endsAt` (Unix seconds) are optional bounds within this mode:
   *  both given walks that window chronologically; omitted, it's the device's recent activity
   *  (most recent points). Mutually exclusive with `eventPicker` (which takes priority if both
   *  are set) and with live mode (neither `eventPicker` nor `history` set). */
  history?: boolean;
  startsAt?: number;
  endsAt?: number;
  /** Hides event-picker mode's built-in "Date range" inputs -- for hosts that drive the window
   *  from their own UI instead. The prev/next/count event-navigation row stays. */
  hideDateRangePicker?: boolean;
  /** Current-position marker style. Defaults to a circle at the theme's primary color. */
  markerShape?: 'circle' | 'square' | 'pin' | 'car' | 'motorcycle' | 'truck' | 'drone';
  markerSize?: 'sm' | 'md' | 'lg';
  /** CSS color (hex, rgb(), etc). Defaults to Ije.config.theme.primaryColor, then a fallback purple. */
  markerColor?: string;
}

/** Ref handle for driving the underlying <ije-map-tracker> element imperatively, e.g.
 *  setPointIndex(i) to move the marker to the i-th telemetry point, or
 *  addEventListener('ije-telemetry-changed', ...) to know when a new window's telemetry has
 *  loaded -- both are what a host-app Timeline Bar needs to drive playback from outside the
 *  widget. */
export type IjeDeviceTrackerViewHandle = IjeMapTracker;

export const IjeDeviceTrackerView = forwardRef<IjeDeviceTrackerViewHandle, IjeDeviceTrackerViewProps>(
  function IjeDeviceTrackerView(
    {
      deviceId,
      title,
      helpMessage,
      width,
      height,
      eventPicker,
      triggerId,
      triggerName,
      history,
      startsAt,
      endsAt,
      hideDateRangePicker,
      markerShape,
      markerSize,
      markerColor,
    },
    forwardedRef
  ) {
    const ref = useRef<IjeMapTracker | null>(null);
    useImperativeHandle(forwardedRef, () => ref.current as IjeDeviceTrackerViewHandle, []);

    return (
      <ije-map-tracker
        ref={ref}
        device-id={deviceId}
        title={title}
        help-message={helpMessage}
        width={width}
        height={height}
        event-picker={eventPicker ? '' : undefined}
        trigger-id={triggerId}
        trigger-name={triggerName}
        history={history ? '' : undefined}
        starts-at={startsAt}
        ends-at={endsAt}
        hide-date-range-picker={hideDateRangePicker ? '' : undefined}
        marker-shape={markerShape}
        marker-size={markerSize}
        marker-color={markerColor}
      />
    );
  }
);
