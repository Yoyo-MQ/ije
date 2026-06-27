import type { SdkConfig } from './index';

type ScalarParam = string | number | boolean | undefined | null;

interface GetOptions {
  params?: Record<string, ScalarParam>;
  arrayParams?: Record<string, (string | number)[]>;
}

interface PostOptions {
  // reserved for future options
}

export class IjeHttpClient {
  private config: SdkConfig | null = null;

  _setConfig(config: SdkConfig) {
    this.config = config;
  }

  async get<T>(path: string, options: GetOptions = {}): Promise<T> {
    const url = this.buildUrl(path, options.params, options.arrayParams);
    const response = await fetch(url, {
      headers: this.buildHeaders(),
    });
    return this.parseResponse<T>(response);
  }

  async post<T>(path: string, body: unknown, _options: PostOptions = {}): Promise<T> {
    const url = this.buildUrl(path);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.buildHeaders(),
      },
      body: JSON.stringify(body),
    });
    return this.parseResponse<T>(response);
  }

  private buildUrl(
    path: string,
    params?: Record<string, ScalarParam>,
    arrayParams?: Record<string, (string | number)[]>,
  ): string {
    if (!this.config) throw new Error('[Yoyo ije] SDK must be initialized before making requests.');
    const url = new URL(`${this.config.apiUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value != null) url.searchParams.append(key, String(value));
      }
    }
    if (arrayParams) {
      for (const [key, values] of Object.entries(arrayParams)) {
        for (const value of values) url.searchParams.append(key, String(value));
      }
    }
    return url.toString();
  }

  private buildHeaders(): HeadersInit {
    if (!this.config) throw new Error('[Yoyo ije] SDK must be initialized before making requests.');
    return { YOYO_API_KEY: this.config.apiKey };
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`[Yoyo ije] Request failed: ${response.status} ${body}`);
    }
    return response.json() as Promise<T>;
  }
}
