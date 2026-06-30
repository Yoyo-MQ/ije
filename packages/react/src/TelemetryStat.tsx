'use client';

export interface TelemetryStatProps {
  deviceId: number;
  metric: string;
  title?: string;
  unit?: string;
  helpMessage?: string;
}

export function TelemetryStat({ deviceId, metric, title, unit, helpMessage }: TelemetryStatProps) {
  return (
    <ije-telemetry-stat
      device-id={deviceId}
      metric={metric}
      title={title}
      unit={unit}
      help-message={helpMessage}
    />
  );
}
