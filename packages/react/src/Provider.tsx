'use client';

import { useEffect } from 'react';
import { Ije, type SdkConfig } from '@yoyomq/ije-core';
import '@yoyomq/ije-ui';

export interface IjeProviderProps {
  config: SdkConfig;
  children: React.ReactNode;
}

export function IjeProvider({ config, children }: IjeProviderProps) {
  useEffect(() => {
    Ije.init(config);
  }, []);

  return <>{children}</>;
}
