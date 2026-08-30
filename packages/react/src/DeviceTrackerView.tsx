'use client';

import { forwardRef, useRef, useImperativeHandle } from 'react';
import type { IjeMapTracker } from '@yoyomq/ije-ui';

export interface IjeDeviceTrackerViewProps {
  deviceId: number;
  title?: string;
  helpMessage?: string;
  width?: string;
  height?: string;
  /** Trip-picker mode: pass trigger-id + optional trigger-name to enable historical trip replay. */
  tripPicker?: boolean;
  triggerId?: number;
  triggerName?: string;
  startsAt?: number;
  endsAt?: number;
  /** Hides the trip-picker's built-in "Date range" inputs -- for hosts that drive the trip
   *  window from their own UI instead. The prev/next/count trip-navigation row stays. */
  hideDateRangePicker?: boolean;
  /** Current-position marker style. Defaults to a circle at the theme's primary color. */
  markerShape?: 'circle' | 'square' | 'pin' | 'car' | 'motorcycle' | 'truck' | 'drone';
  markerSize?: 'sm' | 'md' | 'lg';
  /** CSS color (hex, rgb(), etc). Defaults to Ije.config.theme.primaryColor, then a fallback purple. */
  markerColor?: string;
}

/** Ref handle for driving the underlying <ije-map-tracker> element imperatively, e.g.
 *  setPointIndex(i) to move the marker to a trip's i-th telemetry point, or
 *  addEventListener('ije-trip-changed', ...) to know when a new trip's telemetry has loaded --
 *  both are what a host-app Timeline Bar needs to drive playback from outside the widget. */
export type IjeDeviceTrackerViewHandle = IjeMapTracker;

export const IjeDeviceTrackerView = forwardRef<IjeDeviceTrackerViewHandle, IjeDeviceTrackerViewProps>(
  function IjeDeviceTrackerView(
    {
      deviceId,
      title,
      helpMessage,
      width,
      height,
      tripPicker,
      triggerId,
      triggerName,
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
        trip-picker={tripPicker ? '' : undefined}
        trigger-id={triggerId}
        trigger-name={triggerName}
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
