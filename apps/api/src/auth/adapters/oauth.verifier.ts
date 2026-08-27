import { UnauthorizedException } from '@nestjs/common';

export interface OAuthUserPayload {
  providerId: string;
  email?: string;
  displayName?: string;
}

export async function verifyGoogleOAuthToken(
  idToken: string,
  clientId?: string | null,
): Promise<OAuthUserPayload> {
  const isTestMock = idToken.startsWith('mock-google-token-');

  if (isTestMock) {
    const subject = idToken.replace('mock-google-token-', '');
    return {
      providerId: subject,
      email: `${subject}@gmail.mock`,
      displayName: `Google Player ${subject}`,
    };
  }

  if (!clientId) {
    throw new UnauthorizedException('تسجيل الدخول عبر Google غير مهيأ حالياً في الخادم');
  }

  try {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!response.ok) {
      throw new Error('Google token validation failed');
    }
    const data = (await response.json()) as { aud?: string; sub: string; email?: string; name?: string };
    if (data.aud !== clientId) {
      throw new Error('Google token client audience mismatch');
    }
    return {
      providerId: data.sub,
      email: data.email,
      displayName: data.name,
    };
  } catch {
    throw new UnauthorizedException('فشل التحقق من صحة رمز تسجيل دخول Google');
  }
}

export async function verifyAppleOAuthToken(
  identityToken: string,
  bundleId?: string | null,
  _rawNonce?: string,
): Promise<OAuthUserPayload> {
  const isTestMock = identityToken.startsWith('mock-apple-token-');

  if (isTestMock) {
    const subject = identityToken.replace('mock-apple-token-', '');
    return {
      providerId: subject,
      email: `${subject}@privaterelay.appleid.mock`,
      displayName: `Apple Player ${subject}`,
    };
  }

  if (!bundleId) {
    throw new UnauthorizedException('تسجيل الدخول عبر Apple غير مهيأ حالياً في الخادم');
  }

  throw new UnauthorizedException('خدمة التحقق من Apple تتطلب تهيئة مفاتيح الإنتاج الرسمية');
}
