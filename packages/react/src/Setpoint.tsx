'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { IjeSetpoint as IjeSetpointElement, IjeSetpointEventDetail } from '@yoyomq/ije-ui';

export interface IjeSetpointProps {
  deviceId: number;
  /** Show only this field (its key from the device's schema); otherwise every field that can have a target. */
  fieldKey?: string;
  /** Heading above the targets. Defaults to "Targets". */
  title?: string;
  /** Seconds between refreshes of where the device stands against each target. Defaults to 15; 0 turns it off. */
  refreshInterval?: number;
  onSetpointSaved?: (detail: IjeSetpointEventDetail) => void;
  onSetpointRemoved?: (detail: IjeSetpointEventDetail) => void;
  onCommandSent?: (detail: IjeSetpointEventDetail) => void;
  /** The person asked to create a Command. Open your own flow, then call the handle's refreshCommands(). */
  onCreateCommand?: (detail: IjeSetpointEventDetail) => void;
  onError?: (message: string) => void;
}

/** Ref handle for the underlying <ije-setpoint> element: refresh() reloads the targets, refreshCommands() reloads the Command picker. */
export type IjeSetpointHandle = IjeSetpointElement;

/** The targets of one device: target, tolerance, the Command that delivers it, and where the device stands. Needs device:read to show and device:write to change; the Command picker needs command:read and sending needs command:run. */
export const IjeSetpoint = forwardRef<IjeSetpointHandle, IjeSetpointProps>(function IjeSetpoint(
  { deviceId, fieldKey, title, refreshInterval, onSetpointSaved, onSetpointRemoved, onCommandSent, onCreateCommand, onError },
  forwardedRef,
) {
  const ref = useRef<IjeSetpointElement | null>(null);
  useImperativeHandle(forwardedRef, () => ref.current as IjeSetpointHandle, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const listeners: [string, EventListener][] = [];
    const listen = (name: string, handler: ((detail: IjeSetpointEventDetail) => void) | undefined) => {
      if (!handler) return;
      const listener = (event: Event) => handler((event as CustomEvent<IjeSetpointEventDetail>).detail);
      element.addEventListener(name, listener);
      listeners.push([name, listener]);
    };
    listen('ije-setpoint-saved', onSetpointSaved);
    listen('ije-setpoint-removed', onSetpointRemoved);
    listen('ije-command-sent', onCommandSent);
    listen('ije-create-command', onCreateCommand);
    if (onError) {
      const errorListener = (event: Event) => onError((event as CustomEvent<{ message: string }>).detail.message);
      element.addEventListener('ije-error', errorListener);
      listeners.push(['ije-error', errorListener]);
    }
    return () => listeners.forEach(([name, listener]) => element.removeEventListener(name, listener));
  }, [onSetpointSaved, onSetpointRemoved, onCommandSent, onCreateCommand, onError]);

  return (
    <ije-setpoint
      ref={ref}
      device-id={deviceId}
      field-key={fieldKey}
      title={title}
      refresh-interval={refreshInterval}
    />
  );
});
