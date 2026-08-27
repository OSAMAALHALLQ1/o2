import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, typography } from '../tokens';
import { Button } from './Button';
import { useDirection, getTextAlign } from '../rtl';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  style,
}) => {
  const { direction } = useDirection();

  return (
    <View style={[styles.container, style]}>
      {icon && <View style={styles.iconContainer}>{icon}</View>}
      <Text style={[styles.title, { textAlign: getTextAlign('center', direction) }]}>
        {title}
      </Text>
      {description && (
        <Text
          style={[
            styles.description,
            { textAlign: getTextAlign('center', direction) },
          ]}
        >
          {description}
        </Text>
      )}
      {actionLabel && onAction && (
        <Button
          label={actionLabel}
          variant="secondary"
          size="sm"
          onPress={onAction}
          style={styles.btn}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
  },
  iconContainer: {
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  description: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    maxWidth: 320,
  },
  btn: {
    marginTop: spacing.sm,
  },
});
