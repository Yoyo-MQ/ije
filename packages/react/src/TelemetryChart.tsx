'use client';

export interface TelemetryChartProps {
  deviceId: number;
  metric?: string;
  title?: string;
  helpMessage?: string;
  width?: string;
  height?: string;
}

export function TelemetryChart({ deviceId, metric, title, helpMessage, width, height }: TelemetryChartProps) {
  return (
    <ije-telemetry-chart
      device-id={deviceId}
      metric={metric}
      title={title}
      help-message={helpMessage}
      width={width}
      height={height}
    />
  );
}
