export type UserRole = 'PLAYER' | 'MODERATOR' | 'RESTAURANT_ADMIN' | 'SUPER_ADMIN';

export type ModerationStatus = 'ACTIVE' | 'MUTED' | 'SUSPENDED' | 'BANNED';

export type AuthProvider = 'LOCAL' | 'GOOGLE' | 'APPLE';

export interface UserSummaryDto {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  language: string;
  createdAt: string;
}

export interface SessionDto {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: UserSummaryDto;
}
