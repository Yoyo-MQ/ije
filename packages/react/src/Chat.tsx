'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { IjeChat as IjeChatElement, ResourceLinkResolvers } from '@yoyomq/ije-ui';

export interface IjeChatProps {
  title?: string;
  placeholder?: string;
  width?: string;
  height?: string;
  /** URL templates per entity type, e.g. { devices: '/devices/{id}' }. Set as a DOM property
   *  (not a JSX attribute) since custom elements only receive object props that way pre-React 19. */
  resourceLinkResolvers?: ResourceLinkResolvers;
}

/** Ref handle for driving the underlying <ije-chat> element imperatively, e.g. loadHistory() to
 *  restore a past conversation, addEventListener('ije-entity-navigate', ...) for client-side
 *  routing, or addEventListener('ije-conversation-updated', ...) to know when to refetch a
 *  conversation list (see the package README's "Handling clicks in a single-page app"). */
export type IjeChatHandle = IjeChatElement;

export const IjeChat = forwardRef<IjeChatHandle, IjeChatProps>(function IjeChat(
  { title, placeholder, width, height, resourceLinkResolvers },
  forwardedRef
) {
  const ref = useRef<IjeChatElement | null>(null);
  useImperativeHandle(forwardedRef, () => ref.current as IjeChatHandle, []);

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
});
