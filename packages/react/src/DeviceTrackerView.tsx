'use client';

import { forwardRef, useEffect, useRef, useImperativeHandle } from 'react';
import type {
  IjeDeviceClickDetail,
  IjeGeofenceOverlay,
  IjeMapBasemap,
  IjeMapOverlays,
  IjeMapTracker,
  IjeMapTrackerDeviceAppearance,
} from '@yoyomq/ije-ui';

export interface IjeDeviceTrackerViewProps {
  /** The device to follow. For several devices use `deviceIds` instead. */
  deviceId?: number;
  /** Several devices on one map. Live mode follows each one, and picks up devices added to or
   *  removed from the list; history mode draws one route per device. */
  deviceIds?: (number | string)[];
  /** Where live positions come from. 'mqtt' (default) subscribes to each device's feed; 'host'
   *  takes positions only from the handle's ingestDeviceMessage(), for a host with its own feed. */
  feed?: 'mqtt' | 'host';
  /** Per-device label and colour. Devices left out use the marker-* props and no label. */
  deviceAppearances?: IjeMapTrackerDeviceAppearance[];
  /** A device marker was clicked. Return `false` to suppress the built-in popup, e.g. when the
   *  host shows its own device panel instead. */
  onDeviceClick?: (deviceId: string) => boolean | void;
  /** A click on the map that did not land on a device. */
  onMapClick?: () => void;
  /** Fires on every pan and zoom frame, so a host panel can stay anchored with the handle's project(). */
  onViewChange?: () => void;
  /** 'streets' (default, OpenStreetMap), or a muted 'dark' or 'light' map that lets devices stand out. */
  basemap?: IjeMapBasemap;
  /** Areas, routes and places drawn beneath the devices. */
  overlays?: IjeMapOverlays;
  /** Hides the LIVE badge, e.g. while the host is feeding simulated positions. */
  hideLiveBadge?: boolean;
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
  markerShape?: 'circle' | 'square' | 'pin' | 'car' | 'motorcycle' | 'truck' | 'drone' | 'arrow';
  markerSize?: 'sm' | 'md' | 'lg';
  /** CSS color (hex, rgb(), etc). Defaults to Ije.config.theme.primaryColor, then a fallback purple. */
  markerColor?: string;
  /** Geofences to draw around the device. One marked `emphasised` is the host's own choice (e.g.
   *  the selected trigger's fence); with none marked, whichever fences contain the device are
   *  emphasised instead -- which is what Live mode relies on, having no trigger selected. */
  geofences?: IjeGeofenceOverlay[];
  /** Whether the fences are drawn. They are kept either way, so toggling does not refetch. */
  showGeofences?: boolean;
}

/** Ref handle for driving the underlying <ije-map-tracker> element imperatively, e.g.
 *  setPointIndex(i) to move the markers to the i-th telemetry point, or
 *  addEventListener('ije-telemetry-changed', ...) to know when a new window's telemetry has
 *  loaded -- both are what a host-app Timeline Bar needs to drive playback from outside the
 *  widget. A `feed="host"` tracker takes positions through ingestDeviceMessage(). */
export type IjeDeviceTrackerViewHandle = IjeMapTracker;

export const IjeDeviceTrackerView = forwardRef<IjeDeviceTrackerViewHandle, IjeDeviceTrackerViewProps>(
  function IjeDeviceTrackerView(
    {
      deviceId,
      deviceIds,
      feed,
      deviceAppearances,
      onDeviceClick,
      onMapClick,
      onViewChange,
      basemap,
      overlays,
      hideLiveBadge,
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
      geofences,
      showGeofences,
    },
    forwardedRef
  ) {
    const ref = useRef<IjeMapTracker | null>(null);
    useImperativeHandle(forwardedRef, () => ref.current as IjeDeviceTrackerViewHandle, []);

    // Fences and appearances go through the imperative API rather than attributes: they are
    // structured data, and serialising them into the DOM would re-parse the whole set on every render.
    useEffect(() => {
      ref.current?.setGeofences(geofences ?? []);
    }, [geofences]);

    useEffect(() => {
      ref.current?.setDeviceAppearances(deviceAppearances ?? []);
    }, [deviceAppearances]);

    useEffect(() => {
      const element = ref.current;
      if (!element || !onDeviceClick) return;
      const handleDeviceClick = (event: Event) => {
        const showsPopup = onDeviceClick((event as CustomEvent<IjeDeviceClickDetail>).detail.deviceId);
        if (showsPopup === false) event.preventDefault();
      };
      element.addEventListener('ije-device-click', handleDeviceClick);
      return () => element.removeEventListener('ije-device-click', handleDeviceClick);
    }, [onDeviceClick]);

    useEffect(() => {
      ref.current?.setOverlays(overlays ?? {});
    }, [overlays]);

    useEffect(() => {
      const element = ref.current;
      if (!element) return;
      const handleMapClick = () => onMapClick?.();
      const handleViewChange = () => onViewChange?.();
      element.addEventListener('ije-map-click', handleMapClick);
      element.addEventListener('ije-view-change', handleViewChange);
      return () => {
        element.removeEventListener('ije-map-click', handleMapClick);
        element.removeEventListener('ije-view-change', handleViewChange);
      };
    }, [onMapClick, onViewChange]);

    return (
      <ije-map-tracker
        ref={ref}
        device-id={deviceIds ? undefined : deviceId}
        device-ids={deviceIds ? deviceIds.join(',') : undefined}
        feed={feed}
        basemap={basemap}
        hide-live-badge={hideLiveBadge ? '' : undefined}
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
        show-geofences={showGeofences ? '' : undefined}
      />
    );
  }
);
