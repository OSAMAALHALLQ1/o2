import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ACCESS_TOKEN_KEY = 'o2_access_token';
const REFRESH_TOKEN_KEY = 'o2_refresh_token';

// In-memory fallback for web environments during dev/smoke testing
const webMemoryStorage: Record<string, string> = {};

export const AuthTokenStorage = {
  async getAccessToken(): Promise<string | null> {
    if (Platform.OS === 'web') {
      return webMemoryStorage[ACCESS_TOKEN_KEY] || null;
    }
    try {
      return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    } catch {
      return null;
    }
  },

  async getRefreshToken(): Promise<string | null> {
    if (Platform.OS === 'web') {
      return webMemoryStorage[REFRESH_TOKEN_KEY] || null;
    }
    try {
      return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  },

  async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    if (Platform.OS === 'web') {
      webMemoryStorage[ACCESS_TOKEN_KEY] = accessToken;
      webMemoryStorage[REFRESH_TOKEN_KEY] = refreshToken;
      return;
    }
    try {
      await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
    } catch (e) {
      console.error('Failed to securely store auth tokens', e);
    }
  },

  async clearTokens(): Promise<void> {
    if (Platform.OS === 'web') {
      delete webMemoryStorage[ACCESS_TOKEN_KEY];
      delete webMemoryStorage[REFRESH_TOKEN_KEY];
      return;
    }
    try {
      await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    } catch (e) {
      console.error('Failed to clear secure auth tokens', e);
    }
  },
};
