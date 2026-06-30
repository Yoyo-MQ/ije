'use client';

export interface IjeTelemetryChartProps {
  deviceId: number;
  metric?: string;
  title?: string;
  helpMessage?: string;
  width?: string;
  height?: string;
}

export function IjeTelemetryChart({ deviceId, metric, title, helpMessage, width, height }: IjeTelemetryChartProps) {
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
