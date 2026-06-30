'use client';

export interface IjeTelemetryStatProps {
  deviceId: number;
  metric: string;
  title?: string;
  unit?: string;
  helpMessage?: string;
}

export function IjeTelemetryStat({ deviceId, metric, title, unit, helpMessage }: IjeTelemetryStatProps) {
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
