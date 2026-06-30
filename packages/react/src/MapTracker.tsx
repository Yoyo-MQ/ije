'use client';

export interface MapTrackerProps {
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
}

export function MapTracker({
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
}: MapTrackerProps) {
  return (
    <ije-map-tracker
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
    />
  );
}
