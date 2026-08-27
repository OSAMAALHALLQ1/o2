import React from 'react';
import { StyleSheet, Text, View, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, ScreenContainer, colors, typography, spacing } from '@o2/ui';
import { useAuth } from '../../src/context/AuthContext';

export default function WelcomeScreen() {
  const router = useRouter();
  const { loginWithGoogle, loginWithApple, isLoading } = useAuth();

  const handleGoogleSignIn = async () => {
    try {
      await loginWithGoogle(`mock-google-token-${Date.now().toString().slice(-6)}`);
    } catch (e: any) {
      Alert.alert('تسجيل Google', e.message || 'خدمة Google تتطلب تهيئة بيانات الاعتماد');
    }
  };

  const handleAppleSignIn = async () => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'web') {
      Alert.alert('Apple Sign In', 'تسجيل الدخول بواسطة Apple متاح على أجهزة iOS فقط');
      return;
    }
    try {
      await loginWithApple(`mock-apple-token-${Date.now().toString().slice(-6)}`);
    } catch (e: any) {
      Alert.alert('تسجيل Apple', e.message || 'خدمة Apple تتطلب تهيئة بيانات الاعتماد');
    }
  };

  return (
    <ScreenContainer scrollable={false}>
      <View style={styles.container}>
        {/* Brand Banner */}
        <View style={styles.header}>
          <Text style={styles.brandTitle}>🪐 O2 Universe</Text>
          <Text style={styles.brandSubtitle}>عوالم الألعاب • رفيقك الدائم • مكافآت المطاعم</Text>
        </View>

        {/* Mascot Preview Card */}
        <Card variant="goldBorder" style={styles.previewCard}>
          <Text style={styles.mascotEmoji}>🐼 🦊 🐱 🐰 🐧</Text>
          <Text style={styles.mascotHeading}>اختر رفيقك الدائم في عالم O2</Text>
          <Text style={styles.mascotText}>
            أكثر من 20 رفيق مميز ينتظرونك لبدء رحلة الألعاب والمكافآت التفاعلية
          </Text>
        </Card>

        {/* Action Buttons */}
        <View style={styles.actionContainer}>
          <Button
            label="إنشاء حساب جديد"
            variant="primary"
            size="lg"
            onPress={() => router.push('/(auth)/register')}
            disabled={isLoading}
          />

          <Button
            label="تسجيل الدخول بالبريد"
            variant="secondary"
            size="lg"
            onPress={() => router.push('/(auth)/login')}
            disabled={isLoading}
          />

          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.dividerText}>أو عبر الحسابات</Text>
            <View style={styles.line} />
          </View>

          <View style={styles.oauthRow}>
            <Button
              label="🌐 Google"
              variant="outline"
              size="md"
              style={styles.oauthBtn}
              onPress={handleGoogleSignIn}
              disabled={isLoading}
            />

            {Platform.OS === 'ios' && (
              <Button
                label="🍏 Apple"
                variant="outline"
                size="md"
                style={styles.oauthBtn}
                onPress={handleAppleSignIn}
                disabled={isLoading}
              />
            )}
          </View>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginTop: spacing.xl,
    gap: spacing.xs,
  },
  brandTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize['3xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.brand.primary,
    textAlign: 'center',
  },
  brandSubtitle: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  previewCard: {
    alignItems: 'center',
    padding: spacing.lg,
    marginVertical: spacing.lg,
    backgroundColor: colors.surfaces.surfaceElevated,
  },
  mascotEmoji: {
    fontSize: 42,
    marginBottom: spacing.sm,
  },
  mascotHeading: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  mascotText: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  actionContainer: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xs,
    gap: spacing.sm,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: colors.surfaces.border,
  },
  dividerText: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize['2xs'],
    color: colors.text.tertiary,
  },
  oauthRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  oauthBtn: {
    flex: 1,
  },
});
