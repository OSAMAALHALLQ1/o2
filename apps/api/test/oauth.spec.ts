import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyGoogleOAuthToken,
  verifyAppleOAuthToken,
} from '../src/auth/adapters/oauth.verifier.ts';

describe('Phase 2: OAuth & External Provider Verification Logic', () => {
  describe('Google Sign-In Adapter Verification', () => {
    it('should verify test mock Google id token without external network calls', async () => {
      const mockToken = 'mock-google-token-player123';
      const result = await verifyGoogleOAuthToken(mockToken, null);

      assert.equal(result.providerId, 'player123');
      assert.equal(result.email, 'player123@gmail.mock');
      assert.ok(result.displayName);
    });

    it('should reject absent Google credentials when mock prefix is missing', async () => {
      await assert.rejects(
        async () => {
          await verifyGoogleOAuthToken('live_production_unconfigured_token', null);
        },
        /تسجيل الدخول عبر Google غير مهيأ حالياً في الخادم/,
        'Missing production Google credentials must reject gracefully',
      );
    });
  });

  describe('Apple Sign-In Adapter Verification', () => {
    it('should verify test mock Apple identity token', async () => {
      const mockToken = 'mock-apple-token-player999';
      const result = await verifyAppleOAuthToken(mockToken, null);

      assert.equal(result.providerId, 'player999');
      assert.equal(result.email, 'player999@privaterelay.appleid.mock');
    });

    it('should reject absent Apple credentials when mock prefix is missing', async () => {
      await assert.rejects(
        async () => {
          await verifyAppleOAuthToken('live_apple_unconfigured_token', null);
        },
        /تسجيل الدخول عبر Apple غير مهيأ حالياً في الخادم/,
        'Missing production Apple credentials must reject gracefully',
      );
    });
  });
});
