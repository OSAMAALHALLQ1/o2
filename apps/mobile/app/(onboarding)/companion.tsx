import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { Button, Card, ScreenContainer, colors, typography, spacing, radius } from '@o2/ui';
import { useAuth } from '../../src/context/AuthContext';
import { api } from '../../src/api/client';
import { StarterCompanionDto } from '@o2/types';

// Visual emoji helper mapping archetype to iconic preview icon
const ARCHETYPE_ICONS: Record<string, string> = {
  panda: '🐼',
  bunny: '🐰',
  cat: '🐱',
  fox: '🦊',
  koala: '🐨',
  penguin: '🐧',
  raccoon: '🦝',
  tiny_dino: '🦖',
  lion_cub: '🦁',
  otter: '🦦',
  monkey: '🐵',
  bird: '🐦',
  bear: '🐻',
  hedgehog: '🦔',
  dragon: '🐲',
  sloth: '🦥',
  whale: '🐳',
  deer: '🦌',
  badger: '🦡',
  fantasy_star: '⭐',
};

export default function CompanionOnboardingScreen() {
  const { selectStarterCompanion, isLoading } = useAuth();
  const [companions, setCompanions] = useState<StarterCompanionDto[]>([]);
  const [fetching, setFetching] = useState(true);
  const [selectedCompanion, setSelectedCompanion] = useState<StarterCompanionDto | null>(null);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);

  useEffect(() => {
    async function loadCompanions() {
      try {
        const data = await api.get<StarterCompanionDto[]>('/companions/starters');
        setCompanions(data);
        if (data.length > 0) {
          setSelectedCompanion(data[0]);
        }
      } catch {
        setCompanions([]);
      } finally {
        setFetching(false);
      }
    }
    loadCompanions();
  }, []);

  const handlePermanentSelect = async () => {
    if (!selectedCompanion) return;
    try {
      await selectStarterCompanion(selectedCompanion.id);
      setConfirmModalVisible(false);
    } catch (e: any) {
      Alert.alert('فشل الاختيار', e.message || 'تعذر تأكيد اختيار الرفيق');
    }
  };

  if (fetching) {
    return (
      <ScreenContainer scrollable={false}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.brand.primary} />
          <Text style={styles.loadingText}>جاري تحميل رفقاء O2 Universe...</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.badge}>الخطوة 2 من 2 (اختيار دائم)</Text>
          <Text style={styles.title}>اختر رفيقك الدائم</Text>
          <Text style={styles.subtitle}>
            سيكون رفيقك الأساسي في الصالات والملف الشخصي وتحديات الألعاب
          </Text>
        </View>

        {/* Highlighted Selected Companion Card */}
        {selectedCompanion && (
          <Card variant="goldBorder" style={styles.featuredCard}>
            <Text style={styles.featuredIcon}>
              {ARCHETYPE_ICONS[selectedCompanion.archetype] || '✨'}
            </Text>
            <Text style={styles.featuredName}>
              {selectedCompanion.nameAr} ({selectedCompanion.nameEn})
            </Text>
            <Text style={styles.featuredArchetype}>الفصيلة: {selectedCompanion.archetype}</Text>
            <Text style={styles.featuredDesc}>{selectedCompanion.descriptionAr}</Text>

            <Button
              label={`اختيار ${selectedCompanion.nameAr} بشكل دائم`}
              variant="primary"
              size="lg"
              onPress={() => setConfirmModalVisible(true)}
              style={styles.confirmBtn}
            />
          </Card>
        )}

        {/* 20 Starter Companions Grid */}
        <Text style={styles.gridHeading}>اختر من بين 20 رفيق مميز ({companions.length}):</Text>
        <View style={styles.grid}>
          {companions.map((comp) => {
            const isSelected = selectedCompanion?.id === comp.id;
            return (
              <TouchableOpacity
                key={comp.id || comp.slug}
                style={[styles.companionTile, isSelected && styles.companionTileActive]}
                onPress={() => setSelectedCompanion(comp)}
                activeOpacity={0.8}
              >
                <Text style={styles.tileIcon}>{ARCHETYPE_ICONS[comp.archetype] || '✨'}</Text>
                <Text style={[styles.tileName, isSelected && styles.tileNameActive]}>
                  {comp.nameAr}
                </Text>
                <Text style={styles.tileArchetype}>{comp.nameEn}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Permanent Selection Confirmation Modal */}
        <Modal
          visible={confirmModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setConfirmModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <Card variant="elevated" style={styles.modalCard}>
              <Text style={styles.modalIcon}>
                {selectedCompanion ? ARCHETYPE_ICONS[selectedCompanion.archetype] : '⚠️'}
              </Text>
              <Text style={styles.modalTitle}>تأكيد اختيار الرفيق الدائم</Text>
              <Text style={styles.modalWarning}>
                تنبيه: اختيار الرفيق ({selectedCompanion?.nameAr}) هو اختيار دائم مرتبط بحسابك لبدء
                رحلة الألعاب. هل تود بالتأكيد اعتماده؟
              </Text>

              <View style={styles.modalActions}>
                <Button
                  label="نعم، اعتماده والبدء!"
                  variant="primary"
                  size="md"
                  onPress={handlePermanentSelect}
                  isLoading={isLoading}
                  style={styles.modalBtn}
                />
                <Button
                  label="تراجع وتغيير"
                  variant="secondary"
                  size="md"
                  onPress={() => setConfirmModalVisible(false)}
                  disabled={isLoading}
                  style={styles.modalBtn}
                />
              </View>
            </Card>
          </View>
        </Modal>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: spacing.xl,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  header: {
    marginBottom: spacing.lg,
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
  featuredCard: {
    alignItems: 'center',
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  featuredIcon: {
    fontSize: 64,
    marginBottom: spacing.xs,
  },
  featuredName: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginBottom: 2,
  },
  featuredArchetype: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
    marginBottom: spacing.sm,
  },
  featuredDesc: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  confirmBtn: {
    width: '100%',
  },
  gridHeading: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    textAlign: 'right',
    marginBottom: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  companionTile: {
    width: '48%',
    backgroundColor: colors.surfaces.surface,
    borderColor: colors.surfaces.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  companionTileActive: {
    borderColor: colors.brand.primary,
    backgroundColor: 'rgba(211, 47, 47, 0.1)',
  },
  tileIcon: {
    fontSize: 36,
  },
  tileName: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  tileNameActive: {
    color: colors.brand.primary,
  },
  tileArchetype: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize['2xs'],
    color: colors.text.tertiary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  modalIcon: {
    fontSize: 52,
  },
  modalTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    textAlign: 'center',
  },
  modalWarning: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  modalActions: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  modalBtn: {
    width: '100%',
  },
});
