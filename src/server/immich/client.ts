import { decryptText, encryptText } from '../utils/crypto';
import { normalizeAssetStub } from '../utils/assets';
import type { AppConfig } from '../config';
import type { AppDatabase, ImmichConnectionRecord } from '../db';
import type { AssetStub, ImmichConnectionMode } from '../../shared/contracts';
import { HttpError } from '../utils/http';

type SearchResponse = {
  assets: {
    total: number;
    count: number;
    items: AssetStub[];
  };
};

type RawSearchResponse = {
  assets: {
    total: number;
    count: number;
    items: unknown[];
  };
};

type LoginResponse = {
  accessToken: string;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export class ImmichClient {
  constructor(
    private database: AppDatabase,
    private config: AppConfig
  ) {}

  async validateApiKey(baseUrl: string, apiKey: string): Promise<void> {
    const response = await this.requestRaw({
      baseUrl,
      path: '/api/auth/validateToken',
      method: 'POST',
      headers: {
        'x-api-key': apiKey
      }
    });

    if (!response.ok) {
      throw new HttpError(401, 'Immich API key is invalid');
    }
  }

  async loginWithPassword(baseUrl: string, email: string, password: string): Promise<string> {
    const response = await this.requestJson<LoginResponse>({
      baseUrl,
      path: '/api/auth/login',
      method: 'POST',
      body: {
        email,
        password
      }
    });

    if (!response.accessToken) {
      throw new HttpError(401, 'Immich did not return an access token');
    }

    return response.accessToken;
  }

  async storeApiKeyConnection(baseUrl: string, apiKey: string) {
    await this.validateApiKey(baseUrl, apiKey);
    this.database.saveImmichConnection({
      mode: 'apiKey',
      baseUrl: normalizeBaseUrl(baseUrl),
      apiKeyEnc: encryptText(apiKey, this.config.appSecret),
      emailEnc: null,
      passwordEnc: null,
      accessTokenEnc: null
    });
  }

  async storePasswordConnection(baseUrl: string, email: string, password: string) {
    const accessToken = await this.loginWithPassword(baseUrl, email, password);
    this.database.saveImmichConnection({
      mode: 'password',
      baseUrl: normalizeBaseUrl(baseUrl),
      apiKeyEnc: null,
      emailEnc: encryptText(email, this.config.appSecret),
      passwordEnc: encryptText(password, this.config.appSecret),
      accessTokenEnc: encryptText(accessToken, this.config.appSecret)
    });
  }

  getStoredConnectionMode(): ImmichConnectionMode | null {
    return this.database.getImmichConnection()?.mode ?? null;
  }

  async authenticateStoredApiKey(apiKey: string): Promise<string> {
    const connection = this.requireStoredConnection('apiKey');
    await this.validateApiKey(connection.baseUrl, apiKey);

    this.database.saveImmichConnection({
      mode: 'apiKey',
      baseUrl: connection.baseUrl,
      apiKeyEnc: encryptText(apiKey, this.config.appSecret),
      emailEnc: null,
      passwordEnc: null,
      accessTokenEnc: null
    });

    return 'Immich API key';
  }

  async authenticateStoredPassword(email: string, password: string): Promise<string> {
    const connection = this.requireStoredConnection('password');
    const storedEmail = decryptText(connection.emailEnc, this.config.appSecret);
    if (!storedEmail || storedEmail.toLowerCase() !== email.toLowerCase()) {
      throw new HttpError(401, 'Invalid email or password');
    }

    const accessToken = await this.loginWithPassword(connection.baseUrl, email, password);
    this.database.saveImmichConnection({
      mode: 'password',
      baseUrl: connection.baseUrl,
      apiKeyEnc: null,
      emailEnc: encryptText(email, this.config.appSecret),
      passwordEnc: encryptText(password, this.config.appSecret),
      accessTokenEnc: encryptText(accessToken, this.config.appSecret)
    });

    return email;
  }

  async searchByDateWindow(window: { takenAfter: string; takenBefore: string }, page = 1): Promise<SearchResponse> {
    const response = await this.requestWithStoredConnection<RawSearchResponse>({
      path: '/api/search/metadata',
      method: 'POST',
      body: {
        takenAfter: window.takenAfter,
        takenBefore: window.takenBefore,
        page,
        size: 1000
      }
    });

    const items = response.assets.items
      .map((item) => normalizeAssetStub(item))
      .filter((item): item is AssetStub => item !== null);

    return {
      assets: {
        total: response.assets.total,
        count: items.length,
        items
      }
    };
  }

  async deleteAsset(assetId: string): Promise<void> {
    const response = await this.requestWithStoredConnection<Response>({
      path: '/api/assets',
      method: 'DELETE',
      body: {
        ids: [assetId],
        force: false
      },
      raw: true
    });

    if (!response.ok) {
      throw new HttpError(response.status, 'Immich could not move the asset to trash');
    }
  }

  async fetchAssetMedia(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'DELETE';
      query?: URLSearchParams;
      headers?: Record<string, string>;
    } = {}
  ): Promise<Response> {
    return this.requestWithStoredConnection<Response>({
      path,
      method: options.method ?? 'GET',
      query: options.query,
      headers: options.headers,
      raw: true
    });
  }

  private async requestWithStoredConnection<T>(options: {
    path: string;
    method: 'GET' | 'POST' | 'DELETE';
    body?: unknown;
    headers?: Record<string, string>;
    query?: URLSearchParams;
    raw?: boolean;
  }): Promise<T> {
    const connection = this.database.getImmichConnection();
    if (!connection) {
      throw new HttpError(400, 'Immich connection is not configured');
    }

    return this.requestWithConnection<T>(connection, options, true);
  }

  private requireStoredConnection(expectedMode?: ImmichConnectionMode): ImmichConnectionRecord {
    const connection = this.database.getImmichConnection();
    if (!connection) {
      throw new HttpError(400, 'Immich connection is not configured');
    }

    if (expectedMode && connection.mode !== expectedMode) {
      throw new HttpError(400, 'Stored Immich connection mode does not match this login method');
    }

    return connection;
  }

  private async requestWithConnection<T>(
    connection: ImmichConnectionRecord,
    options: {
      path: string;
      method: 'GET' | 'POST' | 'DELETE';
      body?: unknown;
      headers?: Record<string, string>;
      query?: URLSearchParams;
      raw?: boolean;
    },
    allowRelogin: boolean
  ): Promise<T> {
    const authHeaders = await this.getAuthHeaders(connection);
    const response = await this.requestRaw({
      baseUrl: connection.baseUrl,
      path: options.path,
      method: options.method,
      body: options.body,
      headers: {
        ...authHeaders,
        ...options.headers
      },
      query: options.query
    });

    if (response.status === 401 && allowRelogin && connection.mode === 'password') {
      const renewedConnection = await this.refreshStoredPasswordConnection(connection);
      return this.requestWithConnection<T>(renewedConnection, options, false);
    }

    if (!response.ok) {
      const message = await safeErrorMessage(response);
      throw new HttpError(response.status, message || `Immich request failed with status ${response.status}`);
    }

    if (options.raw) {
      return response as T;
    }

    return (await response.json()) as T;
  }

  private async getAuthHeaders(connection: ImmichConnectionRecord): Promise<Record<string, string>> {
    if (connection.mode === 'apiKey') {
      const apiKey = decryptText(connection.apiKeyEnc, this.config.appSecret);
      if (!apiKey) {
        throw new HttpError(500, 'Immich API key is missing');
      }

      return {
        'x-api-key': apiKey
      };
    }

    const accessToken = decryptText(connection.accessTokenEnc, this.config.appSecret);
    if (!accessToken) {
      const renewed = await this.refreshStoredPasswordConnection(connection);
      return this.getAuthHeaders(renewed);
    }

    return {
      Authorization: `Bearer ${accessToken}`
    };
  }

  private async refreshStoredPasswordConnection(connection: ImmichConnectionRecord): Promise<ImmichConnectionRecord> {
    const email = decryptText(connection.emailEnc, this.config.appSecret);
    const password = decryptText(connection.passwordEnc, this.config.appSecret);
    if (!email || !password) {
      throw new HttpError(500, 'Stored Immich login is incomplete');
    }

    const accessToken = await this.loginWithPassword(connection.baseUrl, email, password);
    const accessTokenEnc = encryptText(accessToken, this.config.appSecret);
    this.database.updateImmichAccessToken(accessTokenEnc);

    return {
      ...connection,
      accessTokenEnc
    };
  }

  private async requestJson<T>(options: {
    baseUrl: string;
    path: string;
    method: 'GET' | 'POST' | 'DELETE';
    body?: unknown;
    headers?: Record<string, string>;
  }): Promise<T> {
    const response = await this.requestRaw(options);
    if (!response.ok) {
      const message = await safeErrorMessage(response);
      throw new HttpError(response.status, message || 'Immich request failed');
    }

    return (await response.json()) as T;
  }

  private async requestRaw(options: {
    baseUrl: string;
    path: string;
    method: 'GET' | 'POST' | 'DELETE';
    body?: unknown;
    headers?: Record<string, string>;
    query?: URLSearchParams;
  }): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.immichTimeoutMs);
    const query = options.query ? `?${options.query.toString()}` : '';

    try {
      return await fetch(`${normalizeBaseUrl(options.baseUrl)}${options.path}${query}`, {
        method: options.method,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });
    } catch (error) {
      throw new HttpError(502, `Unable to reach Immich at ${normalizeBaseUrl(options.baseUrl)}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function safeErrorMessage(response: Response): Promise<string | null> {
  try {
    const json = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(json.message)) {
      return json.message.join(', ');
    }

    return json.message ?? null;
  } catch {
    return null;
  }
}
