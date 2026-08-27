import { AuthTokenStorage } from '../storage/auth-storage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

class ApiClient {
  private isRefreshing = false;
  private refreshSubscribers: ((token: string) => void)[] = [];

  private onTokenRefreshed(token: string) {
    this.refreshSubscribers.forEach((callback) => callback(token));
    this.refreshSubscribers = [];
  }

  private addRefreshSubscriber(callback: (token: string) => void) {
    this.refreshSubscribers.push(callback);
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

    // Handle 401 Unauthorized with token refresh rotation
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
        } catch (err) {
          this.isRefreshing = false;
          await AuthTokenStorage.clearTokens();
          throw err;
        }
      } else {
        // Queue concurrent requests while refreshing
        return new Promise<T>((resolve, reject) => {
          this.addRefreshSubscriber(async (newToken: string) => {
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
          });
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
