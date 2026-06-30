'use client';

import { useEffect, useRef } from 'react';
import type { BarChartData } from '@yoyomq/ije-ui';

export interface BarChartProps {
  data?: BarChartData[];
  loading?: boolean;
  height?: string;
}

export function BarChart({ data, loading, height }: BarChartProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (ref.current && data !== undefined) {
      (ref.current as any).data = data;
    }
  }, [data]);

  return <ije-bar-chart ref={ref} height={height} loading={loading ? '' : undefined} />;
}
