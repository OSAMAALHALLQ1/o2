import React from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import {
  ScreenContainer,
  Card,
  AvatarFrame,
  Badge,
  Button,
  colors,
  spacing,
  typography,
  useToast,
} from '@o2/ui';
import { useAuth } from '../../src/context/AuthContext';
import { mockProfile, mockCompanion } from '../../src/data/mockData';

export default function ProfileScreen() {
  const { showToast } = useToast();
  const { profile, logout, isLoading } = useAuth();

  const handleAction = (title: string) => {
    showToast({
      type: 'info',
      title,
      message: 'ستتوفر هذه الميزة بالكامل في المراحل القادمة.',
    });
  };

  const handleLogout = () => {
    Alert.alert(
      'تسجيل الخروج',
      'هل تود بالتأكيد تسجيل الخروج من هذا الجهاز؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'خروج',
          style: 'destructive',
          onPress: async () => {
            await logout();
          },
        },
      ],
    );
  };

  const displayName = profile?.displayName || profile?.username || mockProfile.displayName;
  const usernameHandle = profile?.username || mockProfile.username;

  return (
    <ScreenContainer scrollable style={styles.container}>
      {/* User Header Profile Card */}
      <Card variant="elevated" style={styles.profileHero}>
        <AvatarFrame
          size={76}
          avatarText={displayName}
          rarity="LEGENDARY"
          isOnline
        />
        <View style={styles.heroText}>
          <Text style={styles.heroDisplayName}>{displayName}</Text>
          <Text style={styles.heroUsername}>@{usernameHandle}</Text>
          <Badge label="لاعب معتمد 🌟" variant="gold" size="sm" />
        </View>
      </Card>

      {/* Game Stats Highlights */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📊 إحصائيات المباريات</Text>
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statVal}>18</Text>
            <Text style={styles.statLabel}>إجمالي الجولات</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statVal}>12</Text>
            <Text style={styles.statLabel}>الانتصارات 🏆</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statVal}>67%</Text>
            <Text style={styles.statLabel}>نسبة الفوز</Text>
          </Card>
        </View>
      </View>

      {/* Companion Card */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🐼 رفيقك المختار</Text>
        <Card variant="highlight" style={styles.companionCard}>
          <Text style={styles.companionEmoji}>🐼</Text>
          <View style={styles.companionInfo}>
            <Text style={styles.companionName}>
              {profile?.selectedCharacterId ? 'رفيقك الدائم المعتمد' : mockCompanion.customName}
            </Text>
            <Text style={styles.companionDesc}>
              رفيق O2 الدائم — جاهز لخوض الجولات والألعاب الجماعية
            </Text>
          </View>
        </Card>
      </View>

      {/* Navigation Entries & Logout */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⚙️ الإعدادات والحساب</Text>
        <View style={styles.navEntriesList}>
          <Card
            style={styles.entryCard}
            onPress={() => handleAction('قائمة الأصدقاء')}
          >
            <Text style={styles.entryIcon}>👥</Text>
            <Text style={styles.entryTitle}>قائمة الأصدقاء والطلبات المعلقة</Text>
            <Text style={styles.entryArrow}>➜</Text>
          </Card>

          <Card
            style={styles.entryCard}
            onPress={() => handleAction('شروط الخدمة والخصوصية')}
          >
            <Text style={styles.entryIcon}>📜</Text>
            <Text style={styles.entryTitle}>شروط الخدمة والخصوصية في O2</Text>
            <Text style={styles.entryArrow}>➜</Text>
          </Card>

          <Button
            label="تسجيل الخروج من الحساب"
            variant="outline"
            size="md"
            onPress={handleLogout}
            isLoading={isLoading}
            style={styles.logoutBtn}
          />
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },
  profileHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  heroText: {
    gap: spacing.xxs,
  },
  heroDisplayName: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  heroUsername: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    gap: 2,
  },
  statVal: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.brand.accent,
  },
  statLabel: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize['2xs'],
    color: colors.text.secondary,
  },
  companionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  companionEmoji: {
    fontSize: 40,
  },
  companionInfo: {
    flex: 1,
    gap: 2,
  },
  companionName: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  companionDesc: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  navEntriesList: {
    gap: spacing.sm,
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  entryIcon: {
    fontSize: 20,
  },
  entryTitle: {
    flex: 1,
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
  },
  entryArrow: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  logoutBtn: {
    marginTop: spacing.sm,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
});
