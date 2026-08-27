import React from 'react';
import { View, StyleSheet, ViewStyle, Text } from 'react-native';
import { colors, radius, typography } from '../tokens';
import { ItemRarity } from '@o2/types';

export interface AvatarFrameProps {
  size?: number;
  rarity?: ItemRarity;
  avatarText?: string;
  avatarElement?: React.ReactNode;
  isOnline?: boolean;
  style?: ViewStyle;
}

export const AvatarFrame: React.FC<AvatarFrameProps> = ({
  size = 48,
  rarity = 'COMMON',
  avatarText,
  avatarElement,
  isOnline,
  style,
}) => {
  const getBorderColor = (): string => {
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
        return colors.surfaces.borderHighlight;
    }
  };

  const indicatorSize = Math.max(10, Math.floor(size * 0.25));

  return (
    <View style={[{ width: size, height: size }, styles.container, style]}>
      <View
        style={[
          styles.frame,
          {
            width: size,
            height: size,
            borderRadius: radius.full,
            borderColor: getBorderColor(),
          },
        ]}
      >
        {avatarElement ? (
          avatarElement
        ) : (
          <View style={styles.textContainer}>
            <Text style={styles.text}>{avatarText ? avatarText.slice(0, 2) : 'O2'}</Text>
          </View>
        )}
      </View>
      {isOnline !== undefined && (
        <View
          style={[
            styles.statusIndicator,
            {
              width: indicatorSize,
              height: indicatorSize,
              borderRadius: radius.full,
              backgroundColor: isOnline ? colors.semantic.success : colors.text.tertiary,
            },
          ]}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  frame: {
    borderWidth: 2,
    backgroundColor: colors.surfaces.surfaceHighlight,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: typography.fontFamily.heading,
    color: colors.text.primary,
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.sm,
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    borderWidth: 2,
    borderColor: colors.surfaces.surface,
  },
});
