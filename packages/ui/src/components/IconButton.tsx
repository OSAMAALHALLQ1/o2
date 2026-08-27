import React from 'react';
import {
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  TouchableOpacityProps,
} from 'react-native';
import { colors, radius, spacing } from '../tokens';

export type IconButtonVariant = 'primary' | 'secondary' | 'surface' | 'ghost' | 'gold';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends TouchableOpacityProps {
  icon: React.ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  style?: ViewStyle;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  variant = 'surface',
  size = 'md',
  disabled,
  style,
  ...props
}) => {
  const getContainerStyle = (): ViewStyle => {
    let dimension = 40;
    if (size === 'sm') dimension = 32;
    if (size === 'lg') dimension = 48;

    const base: ViewStyle = {
      width: dimension,
      height: dimension,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    };

    switch (variant) {
      case 'primary':
        Object.assign(base, { backgroundColor: colors.brand.primary });
        break;
      case 'secondary':
        Object.assign(base, {
          backgroundColor: colors.surfaces.surfaceElevated,
          borderWidth: 1,
          borderColor: colors.surfaces.borderHighlight,
        });
        break;
      case 'ghost':
        Object.assign(base, { backgroundColor: colors.transparent });
        break;
      case 'gold':
        Object.assign(base, { backgroundColor: colors.brand.accent });
        break;
      case 'surface':
      default:
        Object.assign(base, {
          backgroundColor: colors.surfaces.surfaceHighlight,
          borderWidth: 1,
          borderColor: colors.surfaces.border,
        });
        break;
    }

    if (disabled) {
      base.opacity = 0.5;
    }

    return base;
  };

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      disabled={disabled}
      style={[styles.base, getContainerStyle(), style]}
      {...props}
    >
      {icon}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
});
