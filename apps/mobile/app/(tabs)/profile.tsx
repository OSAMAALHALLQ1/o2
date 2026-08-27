import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  ScreenContainer,
  Card,
  AvatarFrame,
  Badge,
  Button,
  colors,
  spacing,
  typography,
  radius,
  useToast,
} from '@o2/ui';
import { mockUser, mockCompanion } from '../../src/data/mockData';

export default function ProfileScreen() {
  const { showToast } = useToast();

  const handleAction = (title: string) => {
    showToast({
      type: 'info',
      title,
      message: 'ستتوفر هذه الميزة بالكامل في المراحل القادمة.',
    });
  };

  return (
    <ScreenContainer scrollable style={styles.container}>
      {/* User Header Profile Card */}
      <Card variant="elevated" style={styles.profileHero}>
        <AvatarFrame
          size={76}
          avatarText={mockUser.displayName}
          rarity="LEGENDARY"
          isOnline
        />
        <View style={styles.heroText}>
          <Text style={styles.heroDisplayName}>{mockUser.displayName}</Text>
          <Text style={styles.heroUsername}>@{mockUser.username}</Text>
          <Badge label="عضو مؤسس 🌟" variant="gold" size="sm" />
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
            <Text style={styles.companionName}>{mockCompanion.customName}</Text>
            <Text style={styles.companionDesc}>
              باندا O2 المحبوب — الحالة: سعيد جداً ومكتمل الرعاية
            </Text>
          </View>
        </Card>
      </View>

      {/* Achievements List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🏆 الإنجازات والأوسمة</Text>
        <Card style={styles.achievementsCard}>
          <View style={styles.achievementRow}>
            <Text style={styles.achieveIcon}>🥇</Text>
            <View style={styles.achieveDetails}>
              <Text style={styles.achieveTitle}>أول طلب موثق من O2</Text>
              <Text style={styles.achieveDesc}>امسح أول فاتورة من مطعم O2</Text>
            </View>
            <Badge label="مكتمل ✓" variant="success" size="sm" />
          </View>

          <View style={styles.achievementRow}>
            <Text style={styles.achieveIcon}>🕵️‍♂️</Text>
            <View style={styles.achieveDetails}>
              <Text style={styles.achieveTitle}>محقق مافيا محترف</Text>
              <Text style={styles.achieveDesc}>اكشف المافيا في 3 مباريات متتالية</Text>
            </View>
            <Badge label="1/3" variant="secondary" size="sm" />
          </View>
        </Card>
      </View>

      {/* Navigation Entries */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⚙️ الإعدادات والأصدقاء</Text>
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
            onPress={() => handleAction('إعدادات الحساب')}
          >
            <Text style={styles.entryIcon}>⚙️</Text>
            <Text style={styles.entryTitle}>إعدادات الحساب واللغة والصوت</Text>
            <Text style={styles.entryArrow}>➜</Text>
          </Card>

          <Card
            style={styles.entryCard}
            onPress={() => handleAction('شروط الخدمة')}
          >
            <Text style={styles.entryIcon}>📜</Text>
            <Text style={styles.entryTitle}>شروط الخدمة والخصوصية في O2</Text>
            <Text style={styles.entryArrow}>➜</Text>
          </Card>
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
  achievementsCard: {
    gap: spacing.md,
  },
  achievementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderColor: colors.surfaces.border,
  },
  achieveIcon: {
    fontSize: 24,
  },
  achieveDetails: {
    flex: 1,
    gap: 2,
  },
  achieveTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  achieveDesc: {
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
});
