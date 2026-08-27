import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle, StyleProp } from 'react-native';
import { colors, radius, spacing, typography } from '../tokens';
import { ItemRarity } from '@o2/types';

export type BadgeVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'gold' | 'rarity';

export interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  rarity?: ItemRarity;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export const Badge: React.FC<BadgeProps> = ({
  label,
  variant = 'primary',
  rarity = 'COMMON',
  size = 'md',
  style,
  textStyle,
}) => {
  const getBackgroundColor = (): string => {
    if (variant === 'rarity') {
      switch (rarity) {
        case 'UNCOMMON':
          return colors.rarity.uncommon;
        case 'RARE':
          return colors.rarity.rare;
        case 'EPIC':
          return colors.rarity.epic;
        case 'LEGENDARY':
          return colors.rarity.legendary;
        case 'MYTHIC':
          return colors.rarity.mythic;
        case 'COMMON':
        default:
          return colors.rarity.common;
      }
    }

    switch (variant) {
      case 'secondary':
        return colors.surfaces.surfaceHighlight;
      case 'success':
        return colors.semantic.success;
      case 'warning':
        return colors.semantic.warning;
      case 'error':
        return colors.semantic.error;
      case 'gold':
        return colors.brand.accent;
      case 'primary':
      default:
        return colors.brand.primary;
    }
  };

  const getTextColor = (): string => {
    if (variant === 'gold') return colors.text.inverse;
    return colors.text.primary;
  };

  const isSmall = size === 'sm';

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: getBackgroundColor(),
          paddingVertical: isSmall ? 1 : spacing.xxs,
          paddingHorizontal: isSmall ? spacing.xs : spacing.sm,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: getTextColor(),
            fontSize: isSmall ? typography.fontSize['2xs'] : typography.fontSize.xs,
          },
          textStyle,
        ]}
      >
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.full,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: typography.fontFamily.heading,
    fontWeight: typography.fontWeight.bold,
    textAlign: 'center',
  },
});
