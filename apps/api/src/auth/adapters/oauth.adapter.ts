import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OAuthUserPayload,
  verifyGoogleOAuthToken,
  verifyAppleOAuthToken,
} from './oauth.verifier';

export type { OAuthUserPayload };
export { verifyGoogleOAuthToken, verifyAppleOAuthToken };

export interface IOAuthVerifier {
  verifyGoogleToken(idToken: string): Promise<OAuthUserPayload>;
  verifyAppleToken(identityToken: string, rawNonce?: string): Promise<OAuthUserPayload>;
}

@Injectable()
export class OAuthAdapter implements IOAuthVerifier {
  private readonly configService?: ConfigService;

  constructor(configService?: ConfigService) {
    this.configService = configService;
  }

  async verifyGoogleToken(idToken: string): Promise<OAuthUserPayload> {
    const clientId = this.configService?.get<string>('GOOGLE_CLIENT_ID');
    return verifyGoogleOAuthToken(idToken, clientId);
  }

  async verifyAppleToken(identityToken: string, rawNonce?: string): Promise<OAuthUserPayload> {
    const bundleId = this.configService?.get<string>('APPLE_BUNDLE_ID');
    return verifyAppleOAuthToken(identityToken, bundleId, rawNonce);
  }
}
