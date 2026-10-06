import type { SdkConfig } from './index';
import { IjeHttpClient } from './httpClient';

/** A saved Command: the message a device is sent and the protocols it may be sent over. */
export interface IjeCommand {
  uuid: string;
  title: string;
  description: string;
  protocols_allowed: string[];
  message_content: Record<string, unknown>;
  created_at?: string;
}

export interface CreateCommandParams {
  title: string;
  description: string;
  messageContent: Record<string, unknown>;
  protocolsAllowed: string[];
}

export type IjeCommandProtocol = 'MQTT' | 'TCP';

/** Picks the protocol to send a Command over: MQTT when the Command allows it, otherwise TCP, or null when it allows neither. */
export function chooseCommandProtocol(command: Pick<IjeCommand, 'protocols_allowed'>): IjeCommandProtocol | null {
  const allowed = command.protocols_allowed.map((protocol) => protocol.toUpperCase());
  if (allowed.includes('MQTT')) return 'MQTT';
  if (allowed.includes('TCP')) return 'TCP';
  return null;
}

/** Saved Commands and sending them, over `/commands`. Listing needs command:read, creating command:create, and sending needs command:run plus device:write on each target. */
export class IjeCommandsClient {
  private http = new IjeHttpClient();

  _setConfig(config: SdkConfig) {
    this.http._setConfig(config);
  }

  list(searchText?: string): Promise<IjeCommand[]> {
    return this.http.get<IjeCommand[]>('/commands', { params: { search_text: searchText, limit: 100 } });
  }

  /** Saves a Command. Creating sends nothing; run it with run(). */
  create(params: CreateCommandParams): Promise<IjeCommand> {
    return this.http.post<IjeCommand>('/commands', {
      title: params.title,
      description: params.description,
      message_content: params.messageContent,
      protocols_allowed: params.protocolsAllowed,
    });
  }

  /** Sends the saved Command to the devices over a protocol it allows, and records the run against the Command. */
  /** Resolves with the devices the command was queued for because they are offline; those run it when they reconnect. */
  async run(command: IjeCommand, deviceIds: number[]): Promise<{ queuedDeviceIds: number[] }> {
    const protocol = chooseCommandProtocol(command);
    if (!protocol) throw new Error(`[Yoyo ije] Command "${command.title}" allows neither MQTT nor TCP.`);
    const result = await this.http.post<{ queued_device_ids?: number[] } | undefined>(protocol === 'MQTT' ? '/commands/mqtt' : '/commands/tcp', {
      action: JSON.stringify(command.message_content),
      device_ids: deviceIds,
      command_uuid: command.uuid,
    });
    return { queuedDeviceIds: result?.queued_device_ids ?? [] };
  }
}
