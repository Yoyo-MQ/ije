import type { SdkConfig } from './index';
import { IjeHttpClient } from './httpClient';

export interface ChatChartSpec {
  chart_type: 'bar' | 'line' | 'pie' | 'scatter' | 'table';
  title: string;
  labels: string[];
  datasets: Array<{ label: string; data: number[] }>;
}

export interface ChatResponse {
  session_id: string;
  answer: string;
  chart?: ChatChartSpec;
}

export class IjeChatClient {
  private sessionId: string | null = null;
  private http = new IjeHttpClient();

  _setConfig(config: SdkConfig) {
    this.http._setConfig(config);
  }

  async ask(question: string): Promise<ChatResponse> {
    const data = await this.http.post<ChatResponse>(
      '/public/api/v1/apigateway/mimir/insights/query',
      { session_id: this.sessionId, question },
    );
    this.sessionId = data.session_id;
    return data;
  }

  resetSession() {
    this.sessionId = null;
  }
}
