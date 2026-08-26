'use client';

import { useEffect, useRef } from 'react';
import type { ResourceLinkResolvers } from '@yoyomq/ije-ui';

export interface IjeChatProps {
  title?: string;
  placeholder?: string;
  width?: string;
  height?: string;
  /** URL templates per entity type, e.g. { devices: '/devices/{id}' }. Set as a DOM property
   *  (not a JSX attribute) since custom elements only receive object props that way pre-React 19. */
  resourceLinkResolvers?: ResourceLinkResolvers;
}

export function IjeChat({ title, placeholder, width, height, resourceLinkResolvers }: IjeChatProps) {
  const ref = useRef<(HTMLElement & { resourceLinkResolvers: ResourceLinkResolvers }) | null>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.resourceLinkResolvers = resourceLinkResolvers ?? {};
    }
  }, [resourceLinkResolvers]);

  return (
    <ije-chat
      ref={ref}
      title={title}
      placeholder={placeholder}
      width={width}
      height={height}
    />
  );
}
