import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { colors, radius, spacing, typography, elevation } from '../tokens';
import { ItemRarity } from '@o2/types';
import { Badge } from './Badge';
import { Button } from './Button';
import { Modal } from './Modal';
import { useDirection, getTextAlign } from '../rtl';

export interface RewardRevealProps {
  visible: boolean;
  onClose: () => void;
  tier?: ItemRarity;
  rewardTitle: string;
  rewardSubtitle?: string;
  rewardIcon?: string;
  isRevealed?: boolean;
  onOpen?: () => void;
  style?: ViewStyle;
}

export const RewardReveal: React.FC<RewardRevealProps> = ({
  visible,
  onClose,
  tier = 'RARE',
  rewardTitle,
  rewardSubtitle,
  rewardIcon = '🎁',
  isRevealed: initialRevealed = false,
  onOpen,
}) => {
  const [revealed, setRevealed] = useState(initialRevealed);
  const { direction } = useDirection();

  const handleOpenBox = () => {
    setRevealed(true);
    onOpen?.();
  };

  const handleClose = () => {
    setRevealed(false);
    onClose();
  };

  return (
    <Modal visible={visible} onClose={handleClose}>
      <View style={styles.container}>
        {!revealed ? (
          <View style={styles.boxContainer}>
            <Text style={styles.boxEmoji}>📦</Text>
            <Text style={[styles.title, { textAlign: getTextAlign('center', direction) }]}>
              صندوق مكافآت جديد!
            </Text>
            <Text style={[styles.subtitle, { textAlign: getTextAlign('center', direction) }]}>
              اضغط لفتح الصندوق واكتشاف المكافأة
            </Text>
            <Button
              label="فتح الصندوق ✨"
              variant="gold"
              size="lg"
              onPress={handleOpenBox}
              style={styles.openBtn}
            />
          </View>
        ) : (
          <View style={styles.revealedContainer}>
            <View style={styles.rewardIconWrapper}>
              <Text style={styles.rewardIcon}>{rewardIcon}</Text>
            </View>
            <Badge variant="rarity" rarity={tier} label={tier} size="md" />
            <Text style={[styles.rewardTitle, { textAlign: getTextAlign('center', direction) }]}>
              {rewardTitle}
            </Text>
            {rewardSubtitle && (
              <Text
                style={[
                  styles.rewardSubtitle,
                  { textAlign: getTextAlign('center', direction) },
                ]}
              >
                {rewardSubtitle}
              </Text>
            )}
            <Button
              label="رائع! متابعة"
              variant="primary"
              size="md"
              onPress={handleClose}
              style={styles.collectBtn}
            />
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  boxContainer: {
    alignItems: 'center',
    gap: spacing.md,
  },
  boxEmoji: {
    fontSize: 72,
    marginVertical: spacing.md,
  },
  title: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.brand.accent,
  },
  subtitle: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  openBtn: {
    marginTop: spacing.md,
    minWidth: 180,
  },
  revealedContainer: {
    alignItems: 'center',
    gap: spacing.md,
  },
  rewardIconWrapper: {
    width: 100,
    height: 100,
    borderRadius: radius.full,
    backgroundColor: colors.surfaces.surfaceHighlight,
    borderWidth: 2,
    borderColor: colors.brand.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.sm,
    ...elevation.glowGold,
  },
  rewardIcon: {
    fontSize: 48,
  },
  rewardTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  rewardSubtitle: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  collectBtn: {
    marginTop: spacing.md,
    minWidth: 160,
  },
});
