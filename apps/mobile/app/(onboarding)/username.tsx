import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, TextInput, View, Alert } from 'react-native';
import { Button, Card, ScreenContainer, colors, typography, spacing, radius } from '@o2/ui';
import { useAuth } from '../../src/context/AuthContext';
import { api } from '../../src/api/client';
import { UsernameCheckResult } from '@o2/types';

export default function UsernameOnboardingScreen() {
  const { setUsername, isLoading, error } = useAuth();
  const [handle, setHandle] = useState('');
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<UsernameCheckResult | null>(null);

  useEffect(() => {
    if (!handle.trim() || handle.trim().length < 3) {
      setCheckResult(null);
      return;
    }

    const timer = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await api.post<UsernameCheckResult>('/me/username/check', {
          username: handle.trim(),
        });
        setCheckResult(res);
      } catch {
        setCheckResult(null);
      } finally {
        setChecking(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [handle]);

  const handleConfirm = async () => {
    if (!handle.trim()) {
      Alert.alert('تنبيه', 'يرجى إدخال اسم مستخدم مميز');
      return;
    }

    if (checkResult && !checkResult.available) {
      Alert.alert('تنبيه', checkResult.reason || 'اسم المستخدم غير متاح');
      return;
    }

    try {
      await setUsername(handle.trim());
    } catch (e: any) {
      Alert.alert('فشل تعيين الاسم', e.message || 'تعذر تعيين اسم المستخدم');
    }
  };

  return (
    <ScreenContainer scrollable>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.badge}>الخطوة 1 من 2</Text>
          <Text style={styles.title}>اختر اسم اللاعب المميز</Text>
          <Text style={styles.subtitle}>
            هذا هو معرفك الدائم والفريد في صالات الألعاب وغرف الدردشة
          </Text>
        </View>

        <Card variant="elevated" style={styles.card}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>اسم المستخدم (Handle)</Text>
            <View style={styles.inputWrapper}>
              <Text style={styles.prefix}>@</Text>
              <TextInput
                style={styles.input}
                placeholder="anas_o2"
                placeholderTextColor={colors.text.tertiary}
                autoCapitalize="none"
                autoCorrect={false}
                value={handle}
                onChangeText={setHandle}
              />
            </View>
          </View>

          {/* Availability Feedback Box */}
          {checking && <Text style={styles.checkingText}>جاري التحقق من التوفر...</Text>}
          {!checking && checkResult && (
            <View
              style={[
                styles.statusBox,
                checkResult.available ? styles.statusAvailable : styles.statusUnavailable,
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  checkResult.available ? styles.textAvailable : styles.textUnavailable,
                ]}
              >
                {checkResult.available
                  ? `✓ اسم المستخدم @${checkResult.username} متاح!`
                  : `✕ ${checkResult.reason || 'اسم المستخدم غير متاح'}`}
              </Text>
            </View>
          )}

          {error && <Text style={styles.errorText}>{error}</Text>}

          <View style={styles.rulesBox}>
            <Text style={styles.rulesHeading}>شروط اختيار الاسم:</Text>
            <Text style={styles.ruleItem}>• من 3 إلى 20 خانة</Text>
            <Text style={styles.ruleItem}>• أحرف إنجليزية وأرقام وشرطة سفلية (_) فقط</Text>
            <Text style={styles.ruleItem}>• تطابق غير حساس لحالة الأحرف (anas يطابق ANAS)</Text>
          </View>

          <Button
            label="تأكيد ومتابعة لاختيار الرفيق"
            variant="primary"
            size="lg"
            onPress={handleConfirm}
            isLoading={isLoading}
            disabled={!checkResult?.available}
            style={styles.submitBtn}
          />
        </Card>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: spacing.xl,
  },
  header: {
    marginBottom: spacing.xl,
    gap: spacing.xs,
  },
  badge: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.brand.accent,
    textAlign: 'right',
  },
  title: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    textAlign: 'right',
  },
  subtitle: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    textAlign: 'right',
    lineHeight: 22,
  },
  card: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  inputGroup: {
    gap: spacing.xs,
  },
  label: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    textAlign: 'right',
  },
  inputWrapper: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.surfaces.background,
    borderColor: colors.surfaces.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  prefix: {
    fontSize: typography.fontSize.lg,
    color: colors.brand.accent,
    fontWeight: typography.fontWeight.bold,
    marginLeft: spacing.xs,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    color: colors.text.primary,
    fontSize: typography.fontSize.md,
    textAlign: 'left',
  },
  checkingText: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
    textAlign: 'right',
  },
  statusBox: {
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  statusAvailable: {
    backgroundColor: colors.semantic.successBackground,
    borderColor: colors.semantic.success,
  },
  statusUnavailable: {
    backgroundColor: colors.semantic.errorBackground,
    borderColor: colors.semantic.error,
  },
  statusText: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    textAlign: 'right',
    fontWeight: typography.fontWeight.semibold,
  },
  textAvailable: {
    color: colors.semantic.success,
  },
  textUnavailable: {
    color: colors.semantic.error,
  },
  errorText: {
    fontFamily: typography.fontFamily.body,
    color: colors.semantic.error,
    fontSize: typography.fontSize.xs,
    textAlign: 'right',
  },
  rulesBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: 4,
  },
  rulesHeading: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    textAlign: 'right',
    marginBottom: 4,
  },
  ruleItem: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize['2xs'],
    color: colors.text.secondary,
    textAlign: 'right',
  },
  submitBtn: {
    marginTop: spacing.sm,
  },
});
