import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  ScreenContainer,
  Card,
  Button,
  Badge,
  colors,
  spacing,
  typography,
  radius,
  useToast,
} from '@o2/ui';
import { mockBranches } from '../../src/data/mockData';

export default function OrderScreen() {
  const { showToast } = useToast();
  const [selectedBranchId, setSelectedBranchId] = useState(mockBranches[0].id);

  const handleOrderOnline = () => {
    showToast({
      type: 'info',
      title: '🍔 مطعم O2',
      message: 'سيتم تحويلك إلى بوابة طلبات O2 المباشرة في المرحلة القادمة.',
    });
  };

  const handleScanReceipt = () => {
    showToast({
      type: 'info',
      title: '📷 مسح فاتورة O2',
      message: 'ماسح رمز الفاتورة سيتم تفعيله عند ربط واجهة المطعم في Phase 10.',
    });
  };

  return (
    <ScreenContainer scrollable style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>🍔 مطعم O2 — فرعك الحقيقي</Text>
        <Text style={styles.subtitle}>
          تناول وجبات O2 اللذيذة واكسب جواهر حصرية ومكافآت ذهبية لرفيقك
        </Text>
      </View>

      {/* Rewards Banner */}
      <Card variant="goldBorder" style={styles.rewardBanner}>
        <Text style={styles.bannerEmoji}>✨💎✨</Text>
        <View style={styles.bannerTextContainer}>
          <Text style={styles.bannerTitle}>كل طلب في مطعم O2 يكافئك بالجواهر!</Text>
          <Text style={styles.bannerDesc}>
            اطلب وجبتك أو امسح رمز الاستجابة السريع (QR) على فاتورتك لتحصل على جواهر O2 فوراً.
          </Text>
        </View>
      </Card>

      {/* Branch Selector */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📍 اختر الفرع القريب منك</Text>
        <View style={styles.branchesList}>
          {mockBranches.map((branch) => {
            const isSelected = selectedBranchId === branch.id;
            return (
              <Card
                key={branch.id}
                variant={isSelected ? 'highlight' : 'default'}
                style={[
                  styles.branchCard,
                  isSelected && styles.branchCardSelected,
                ]}
                onPress={() => setSelectedBranchId(branch.id)}
              >
                <View style={styles.branchHeader}>
                  <Text style={styles.branchName}>{branch.name}</Text>
                  {isSelected && (
                    <Badge label="الفرع المحدد ✓" variant="success" size="sm" />
                  )}
                </View>
                {branch.address && (
                  <Text style={styles.branchAddress}>{branch.address}</Text>
                )}
              </Card>
            );
          })}
        </View>
      </View>

      {/* Order Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🛍️ خيارات الطلب وتوثيق الفواتير</Text>
        <Card variant="elevated" style={styles.actionCard}>
          <View style={styles.actionRow}>
            <Text style={styles.actionIcon}>🛵</Text>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>تصفح قائمة الطعام واطلب</Text>
              <Text style={styles.actionDesc}>
                شاورما، برجر، بيتزا، وألذ الحلويات الشرقية والجيلاتو
              </Text>
            </View>
          </View>
          <Button
            label="فتح قائمة طعام O2 📜"
            variant="primary"
            size="md"
            onPress={handleOrderOnline}
          />
        </Card>

        <Card variant="elevated" style={styles.actionCard}>
          <View style={styles.actionRow}>
            <Text style={styles.actionIcon}>🧾</Text>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>مسح فاتورة الطلب (Receipt QR)</Text>
              <Text style={styles.actionDesc}>
                هل طلبت داخل الفرع؟ امسح رمز الـ QR المطبوع على الفاتورة لربط المكافأة
              </Text>
            </View>
          </View>
          <Button
            label="مسح رمز الفاتورة 📷"
            variant="gold"
            size="md"
            onPress={handleScanReceipt}
          />
        </Card>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xxs,
  },
  title: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  subtitle: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  rewardBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  bannerEmoji: {
    fontSize: 32,
  },
  bannerTextContainer: {
    flex: 1,
    gap: 2,
  },
  bannerTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.brand.accent,
  },
  bannerDesc: {
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
  branchesList: {
    gap: spacing.sm,
  },
  branchCard: {
    gap: spacing.xs,
  },
  branchCardSelected: {
    borderColor: colors.brand.primary,
    borderWidth: 1.5,
  },
  branchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  branchName: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  branchAddress: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  actionCard: {
    gap: spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  actionIcon: {
    fontSize: 32,
  },
  actionInfo: {
    flex: 1,
    gap: 2,
  },
  actionTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  actionDesc: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
});
