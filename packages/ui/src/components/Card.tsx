import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, TouchableOpacity, TouchableOpacityProps } from 'react-native';
import { colors, radius, spacing, elevation } from '../tokens';

export type CardVariant = 'default' | 'elevated' | 'highlight' | 'outlined' | 'goldBorder';

export interface CardProps {
  children: React.ReactNode;
  variant?: CardVariant;
  style?: StyleProp<ViewStyle>;
  onPress?: TouchableOpacityProps['onPress'];
  disabled?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  style,
  onPress,
  disabled,
}) => {
  const getCardStyle = (): ViewStyle => {
    const base: ViewStyle = {
      backgroundColor: colors.surfaces.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.surfaces.border,
    };

    switch (variant) {
      case 'elevated':
        Object.assign(base, {
          backgroundColor: colors.surfaces.surfaceElevated,
          ...elevation.md,
        });
        break;
      case 'highlight':
        Object.assign(base, {
          backgroundColor: colors.surfaces.surfaceHighlight,
          borderColor: colors.surfaces.borderHighlight,
        });
        break;
      case 'outlined':
        Object.assign(base, {
          backgroundColor: colors.transparent,
          borderColor: colors.surfaces.borderHighlight,
        });
        break;
      case 'goldBorder':
        Object.assign(base, {
          backgroundColor: colors.surfaces.surfaceElevated,
          borderColor: colors.brand.accent,
          ...elevation.glowGold,
        });
        break;
      case 'default':
      default:
        break;
    }

    return base;
  };

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onPress}
        disabled={disabled}
        style={[getCardStyle(), style]}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={[getCardStyle(), style]}>{children}</View>;
};
