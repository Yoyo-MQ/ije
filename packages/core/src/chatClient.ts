import type { SdkConfig } from './index';
import { IjeApiError, IjeHttpClient } from './httpClient';

const AI_CREDITS_EXHAUSTED_CODE = 'AI_CREDITS_EXHAUSTED';

export class AiCreditsExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiCreditsExhaustedError';
  }
}

export interface ChatChartSpec {
  chart_type: 'bar' | 'line' | 'pie' | 'scatter' | 'table';
  title: string;
  labels: string[];
  datasets: Array<{ label: string; data: number[] }>;
}

export interface EntityReference {
  entity_type: 'devices' | 'triggers' | 'trips' | 'workflows';
  id: string;
  label: string;
  /** Required when entity_type is 'trips' — the id of the device the trip belongs to. */
  device_id?: string;
}

export interface ChatResponse {
  session_id: string;
  answer: string;
  chart?: ChatChartSpec;
  entity_references?: EntityReference[];
}

/** One AI conversation session, as listed by IjeChatClient.listConversations(). */
export interface IjeConversationSummary {
  session_id: string;
  title: string;
  turn_count: number;
  started_at: string;
  last_activity_at: string;
}

export interface IjeConversationsResponse {
  sessions: IjeConversationSummary[];
  has_more: boolean;
}

/** One Q&A turn within a conversation session, as returned by IjeChatClient.getConversation(). */
export interface IjeConversationMessage {
  question: string;
  answer: string | null;
  chart?: ChatChartSpec;
  entity_references?: EntityReference[];
  created_at: string;
  completed_at: string | null;
}

export interface IjeConversationDetail {
  session_id: string;
  messages: IjeConversationMessage[];
}

export class IjeChatClient {
  private sessionId: string | null = null;
  private http = new IjeHttpClient();

  _setConfig(config: SdkConfig) {
    this.http._setConfig(config);
  }

  async ask(question: string): Promise<ChatResponse> {
    try {
      const data = await this.http.post<ChatResponse>(
        '/public/api/v1/apigateway/mimir/insights/query',
        { session_id: this.sessionId, question },
      );
      this.sessionId = data.session_id;
      return data;
    } catch (err) {
      if (err instanceof IjeApiError && err.errorCode === AI_CREDITS_EXHAUSTED_CODE) {
        throw new AiCreditsExhaustedError(
          err.errorMessage ?? "You've used all your free AI credits this month. Upgrade your plan to get more.",
        );
      }
      throw err;
    }
  }

  resetSession() {
    this.sessionId = null;
  }

  /** List past AI conversation sessions for the organization, most recently active first. */
  listConversations(
    params: { limit?: number; cursorLastActivityAt?: string; cursorSessionId?: string } = {},
  ): Promise<IjeConversationsResponse> {
    return this.http.get<IjeConversationsResponse>('/public/api/v1/apigateway/mimir/conversations', {
      params: {
        limit: params.limit,
        cursor_last_activity_at: params.cursorLastActivityAt,
        cursor_session_id: params.cursorSessionId,
      },
    });
  }

  /** Fetch a conversation session's full transcript, in turn order, with any rendered charts. */
  getConversation(sessionId: string): Promise<IjeConversationDetail> {
    return this.http.get<IjeConversationDetail>(
      `/public/api/v1/apigateway/mimir/conversations/${encodeURIComponent(sessionId)}`,
    );
  }

  /**
   * Continue a past conversation: the next ask() call sends this session id. The server
   * transparently rebuilds context from history if the session has expired server-side.
   */
  resumeSession(sessionId: string) {
    this.sessionId = sessionId;
  }

  /** The session id the next ask() call will use, or null if no conversation is in progress. */
  get currentSessionId(): string | null {
    return this.sessionId;
  }
}
