export type UserRole = 'PLAYER' | 'MODERATOR' | 'RESTAURANT_ADMIN' | 'SUPER_ADMIN';

export type ModerationStatus = 'ACTIVE' | 'MUTED' | 'SUSPENDED' | 'BANNED';

export type AuthProviderType = 'EMAIL' | 'GOOGLE' | 'APPLE';

export interface UserSummaryDto {
  id: string;
  role: UserRole;
  moderationStatus: ModerationStatus;
  createdAt: string;
  lastActiveAt: string;
}

export interface PlayerProfileDto {
  userId: string;
  username: string | null;
  normalizedUsername: string | null;
  displayName: string | null;
  language: string;
  selectedCharacterId: string | null;
  isOnboarded: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // in seconds (e.g. 900 for 15 minutes)
}

export interface AuthSessionResponse {
  user: UserSummaryDto;
  profile: PlayerProfileDto | null;
  tokens: AuthTokens;
  sessionId: string;
}

export interface MeResponse {
  user: UserSummaryDto;
  profile: PlayerProfileDto | null;
  activeSessionId: string;
}

export interface UsernameCheckResult {
  username: string;
  available: boolean;
  reason?: string;
}
