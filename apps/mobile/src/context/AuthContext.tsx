import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AuthTokenStorage } from '../storage/auth-storage';
import { api } from '../api/client';
import {
  AuthSessionResponse,
  MeResponse,
  PlayerProfileDto,
  UserSummaryDto,
  StarterCompanionDto,
} from '@o2/types';

export type AuthState =
  | 'booting'
  | 'unauthenticated'
  | 'onboarding_username'
  | 'onboarding_companion'
  | 'authenticated';

interface AuthContextType {
  authState: AuthState;
  user: UserSummaryDto | null;
  profile: PlayerProfileDto | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  loginWithApple: (identityToken: string) => Promise<void>;
  setUsername: (username: string) => Promise<void>;
  selectStarterCompanion: (characterId: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>('booting');
  const [user, setUser] = useState<UserSummaryDto | null>(null);
  const [profile, setProfile] = useState<PlayerProfileDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const deriveStateFromProfile = (prof: PlayerProfileDto | null): AuthState => {
    if (!prof) return 'onboarding_username';
    if (!prof.username) return 'onboarding_username';
    if (!prof.selectedCharacterId) return 'onboarding_companion';
    return 'authenticated';
  };

  const checkSession = useCallback(async () => {
    try {
      const accessToken = await AuthTokenStorage.getAccessToken();
      const refreshToken = await AuthTokenStorage.getRefreshToken();

      if (!accessToken && !refreshToken) {
        setAuthState('unauthenticated');
        return;
      }

      const res = await api.get<MeResponse>('/me');
      setUser(res.user);
      setProfile(res.profile);
      setAuthState(deriveStateFromProfile(res.profile));
    } catch {
      await AuthTokenStorage.clearTokens();
      setUser(null);
      setProfile(null);
      setAuthState('unauthenticated');
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const handleAuthSuccess = async (res: AuthSessionResponse) => {
    await AuthTokenStorage.setTokens(res.tokens.accessToken, res.tokens.refreshToken);
    setUser(res.user);
    setProfile(res.profile);
    setAuthState(deriveStateFromProfile(res.profile));
  };

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.post<AuthSessionResponse>('/auth/login', { email, password }, { skipAuth: true });
      await handleAuthSuccess(res);
    } catch (err: any) {
      setError(err.message || 'فشل تسجيل الدخول');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.post<AuthSessionResponse>('/auth/register', { email, password }, { skipAuth: true });
      await handleAuthSuccess(res);
    } catch (err: any) {
      setError(err.message || 'فشل إنشاء الحساب');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = async (idToken: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.post<AuthSessionResponse>('/auth/google', { idToken }, { skipAuth: true });
      await handleAuthSuccess(res);
    } catch (err: any) {
      setError(err.message || 'فشل تسجيل الدخول عبر Google');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithApple = async (identityToken: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.post<AuthSessionResponse>('/auth/apple', { identityToken }, { skipAuth: true });
      await handleAuthSuccess(res);
    } catch (err: any) {
      setError(err.message || 'فشل تسجيل الدخول عبر Apple');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const setUsernameHandle = async (username: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const updated = await api.post<PlayerProfileDto>('/me/username', { username });
      setProfile(updated);
      setAuthState(deriveStateFromProfile(updated));
    } catch (err: any) {
      setError(err.message || 'فشل تعيين اسم المستخدم');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const selectStarterCompanion = async (characterId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.post<{ success: boolean; selectedCharacter: StarterCompanionDto; profile: any }>(
        '/me/companion/select',
        { characterId },
      );
      if (res.profile) {
        setProfile((prev) => prev ? { ...prev, selectedCharacterId: characterId, isOnboarded: res.profile.isOnboarded } : null);
      }
      setAuthState('authenticated');
    } catch (err: any) {
      setError(err.message || 'فشل اختيار الرفيق');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await api.post('/auth/logout').catch(() => {});
    } finally {
      await AuthTokenStorage.clearTokens();
      setUser(null);
      setProfile(null);
      setAuthState('unauthenticated');
      setIsLoading(false);
    }
  };

  const clearError = () => setError(null);

  const refreshProfile = async () => {
    try {
      const res = await api.get<MeResponse>('/me');
      setUser(res.user);
      setProfile(res.profile);
      setAuthState(deriveStateFromProfile(res.profile));
    } catch (e) {
      console.warn('Failed to refresh profile', e);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        authState,
        user,
        profile,
        isLoading,
        error,
        login,
        register,
        loginWithGoogle,
        loginWithApple,
        setUsername: setUsernameHandle,
        selectStarterCompanion,
        logout,
        clearError,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
