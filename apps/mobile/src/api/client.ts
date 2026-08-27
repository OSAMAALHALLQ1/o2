import { AuthTokenStorage } from '../storage/auth-storage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

interface RefreshSubscriber {
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}

class ApiClient {
  private isRefreshing = false;
  private refreshSubscribers: RefreshSubscriber[] = [];

  private onTokenRefreshed(token: string) {
    this.refreshSubscribers.forEach((sub) => sub.resolve(token));
    this.refreshSubscribers = [];
  }

  private onRefreshFailed(error: Error) {
    this.refreshSubscribers.forEach((sub) => sub.reject(error));
    this.refreshSubscribers = [];
  }

  private addRefreshSubscriber(resolve: (token: string) => void, reject: (error: Error) => void) {
    this.refreshSubscribers.push({ resolve, reject });
  }

  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (!options.skipAuth) {
      const accessToken = await AuthTokenStorage.getAccessToken();
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Single-Flight 401 Refresh Mutex Queue
    if (response.status === 401 && !options.skipAuth && endpoint !== '/auth/refresh' && endpoint !== '/auth/login') {
      if (!this.isRefreshing) {
        this.isRefreshing = true;
        try {
          const refreshToken = await AuthTokenStorage.getRefreshToken();
          if (!refreshToken) {
            await AuthTokenStorage.clearTokens();
            throw new Error('جلسة الدخول منتهية');
          }

          const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });

          if (!refreshRes.ok) {
            await AuthTokenStorage.clearTokens();
            throw new Error('فشل تجديد رمز الدخول');
          }

          const refreshData = await refreshRes.json();
          await AuthTokenStorage.setTokens(refreshData.accessToken, refreshData.refreshToken);
          this.isRefreshing = false;
          this.onTokenRefreshed(refreshData.accessToken);

          // Retry original request with new token
          headers['Authorization'] = `Bearer ${refreshData.accessToken}`;
          const retryRes = await fetch(url, { ...options, headers });
          if (!retryRes.ok) {
            const errBody = await retryRes.json().catch(() => ({}));
            throw new Error(errBody.message || `API Error: ${retryRes.status}`);
          }
          return retryRes.json();
        } catch (err: any) {
          this.isRefreshing = false;
          await AuthTokenStorage.clearTokens();
          this.onRefreshFailed(err instanceof Error ? err : new Error(String(err)));
          throw err;
        }
      } else {
        // Queue concurrent requests while single-flight refresh is executing
        return new Promise<T>((resolve, reject) => {
          this.addRefreshSubscriber(
            async (newToken: string) => {
              try {
                headers['Authorization'] = `Bearer ${newToken}`;
                const retryRes = await fetch(url, { ...options, headers });
                if (!retryRes.ok) {
                  const errBody = await retryRes.json().catch(() => ({}));
                  return reject(new Error(errBody.message || `API Error: ${retryRes.status}`));
                }
                resolve(await retryRes.json());
              } catch (retryErr) {
                reject(retryErr);
              }
            },
            (error: Error) => {
              reject(error);
            },
          );
        });
      }
    }

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.message || `حدث خطأ في الخادم (${response.status})`);
    }

    return response.json();
  }

  get<T>(endpoint: string, options?: RequestOptions) {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  post<T>(endpoint: string, body?: any, options?: RequestOptions) {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }
}

export const api = new ApiClient();
