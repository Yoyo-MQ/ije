'use client';

import { useEffect, useRef } from 'react';
import type { AggregateData } from '@yoyomq/ije-ui';

export interface AggregateStatProps {
  data?: AggregateData;
  loading?: boolean;
}

export function AggregateStat({ data, loading }: AggregateStatProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (ref.current && data !== undefined) {
      (ref.current as any).data = data;
    }
  }, [data]);

  return <ije-aggregate-stat ref={ref} loading={loading ? '' : undefined} />;
}
