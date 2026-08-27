import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View, Alert, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, ScreenContainer, colors, typography, spacing, radius } from '@o2/ui';
import { useAuth } from '../../src/context/AuthContext';

export default function LoginScreen() {
  const router = useRouter();
  const { login, isLoading, error, clearError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    clearError();
    if (!email.trim() || !password) {
      Alert.alert('تنبيه', 'يرجى إدخال البريد الإلكتروني وكلمة المرور');
      return;
    }

    try {
      await login(email.trim(), password);
    } catch (e: any) {
      Alert.alert('فشل تسجيل الدخول', e.message || 'بيانات الدخول غير صحيحة');
    }
  };

  return (
    <ScreenContainer scrollable>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>تسجيل الدخول</Text>
          <Text style={styles.subtitle}>أهلاً بعودتك إلى مجتمع O2 Universe</Text>
        </View>

        <Card variant="elevated" style={styles.formCard}>
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>البريد الإلكتروني</Text>
            <TextInput
              style={styles.input}
              placeholder="example@o2.com"
              placeholderTextColor={colors.text.tertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={(val) => {
                setEmail(val);
                if (error) clearError();
              }}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>كلمة المرور</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={colors.text.tertiary}
              secureTextEntry
              value={password}
              onChangeText={(val) => {
                setPassword(val);
                if (error) clearError();
              }}
            />
          </View>

          <Button
            label="دخول"
            variant="primary"
            size="lg"
            onPress={handleLogin}
            isLoading={isLoading}
            style={styles.submitBtn}
          />
        </Card>

        <View style={styles.footer}>
          <Text style={styles.footerText}>ليس لديك حساب؟</Text>
          <TouchableOpacity onPress={() => router.replace('/(auth)/register')}>
            <Text style={styles.linkText}>إنشاء حساب جديد</Text>
          </TouchableOpacity>
        </View>
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
  },
  formCard: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  errorBox: {
    backgroundColor: colors.semantic.errorBackground,
    borderColor: colors.semantic.error,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  errorText: {
    fontFamily: typography.fontFamily.body,
    color: colors.semantic.error,
    fontSize: typography.fontSize.xs,
    textAlign: 'right',
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
  input: {
    backgroundColor: colors.surfaces.background,
    borderColor: colors.surfaces.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
    textAlign: 'right',
  },
  submitBtn: {
    marginTop: spacing.sm,
  },
  footer: {
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xl,
  },
  footerText: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  linkText: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.brand.accent,
  },
});
