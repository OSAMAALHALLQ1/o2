import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
  StyleProp,
  TouchableOpacityProps,
} from 'react-native';
import { colors, radius, spacing, typography } from '../tokens';
import { useDirection, getFlexDirection } from '../rtl';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'gold' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<TouchableOpacityProps, 'style'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export const Button: React.FC<ButtonProps> = ({
  label,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  disabled,
  style,
  textStyle,
  ...props
}) => {
  const { direction } = useDirection();

  const getContainerStyle = (): ViewStyle => {
    const base: ViewStyle = {
      flexDirection: getFlexDirection('row', direction),
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
    };

    switch (size) {
      case 'sm':
        Object.assign(base, { paddingVertical: spacing.xs, paddingHorizontal: spacing.md });
        break;
      case 'lg':
        Object.assign(base, { paddingVertical: spacing.lg, paddingHorizontal: spacing.xxl });
        break;
      case 'md':
      default:
        Object.assign(base, { paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.lg });
        break;
    }

    switch (variant) {
      case 'secondary':
        Object.assign(base, {
          backgroundColor: colors.surfaces.surfaceElevated,
          borderWidth: 1,
          borderColor: colors.surfaces.borderHighlight,
        });
        break;
      case 'outline':
        Object.assign(base, {
          backgroundColor: colors.transparent,
          borderWidth: 1.5,
          borderColor: colors.brand.primary,
        });
        break;
      case 'ghost':
        Object.assign(base, {
          backgroundColor: colors.transparent,
        });
        break;
      case 'gold':
        Object.assign(base, {
          backgroundColor: colors.brand.accent,
        });
        break;
      case 'danger':
        Object.assign(base, {
          backgroundColor: colors.semantic.error,
        });
        break;
      case 'primary':
      default:
        Object.assign(base, {
          backgroundColor: colors.brand.primary,
        });
        break;
    }

    if (disabled || isLoading) {
      base.opacity = 0.5;
    }

    return base;
  };

  const getTextStyle = (): TextStyle => {
    const base: TextStyle = {
      fontFamily: typography.fontFamily.heading,
      fontWeight: typography.fontWeight.bold,
      textAlign: 'center',
    };

    switch (size) {
      case 'sm':
        Object.assign(base, { fontSize: typography.fontSize.sm });
        break;
      case 'lg':
        Object.assign(base, { fontSize: typography.fontSize.lg });
        break;
      case 'md':
      default:
        Object.assign(base, { fontSize: typography.fontSize.md });
        break;
    }

    switch (variant) {
      case 'outline':
      case 'ghost':
        Object.assign(base, { color: colors.brand.primary });
        break;
      case 'gold':
        Object.assign(base, { color: colors.text.inverse });
        break;
      case 'secondary':
        Object.assign(base, { color: colors.text.primary });
        break;
      case 'danger':
      case 'primary':
      default:
        Object.assign(base, { color: colors.text.primary });
        break;
    }

    return base;
  };

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      disabled={disabled || isLoading}
      style={[styles.base, getContainerStyle(), style]}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'gold' ? colors.text.inverse : colors.text.primary}
        />
      ) : (
        <>
          {leftIcon}
          <Text style={[getTextStyle(), textStyle]}>{label}</Text>
          {rightIcon}
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    gap: spacing.sm,
  },
});
