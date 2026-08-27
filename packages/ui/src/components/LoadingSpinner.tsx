import React from 'react';
import { ActivityIndicator, View, StyleSheet, ViewStyle, Text } from 'react-native';
import { colors, spacing, typography } from '../tokens';

export interface LoadingSpinnerProps {
  size?: 'small' | 'large';
  color?: string;
  label?: string;
  style?: ViewStyle;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'large',
  color = colors.brand.primary,
  label,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      <ActivityIndicator size={size} color={color} />
      {label && <Text style={styles.label}>{label}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  label: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
});
