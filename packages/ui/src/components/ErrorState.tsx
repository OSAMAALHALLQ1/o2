import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, typography } from '../tokens';
import { Button } from './Button';
import { useDirection, getTextAlign } from '../rtl';

export interface ErrorStateProps {
  title?: string;
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
  style?: ViewStyle;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'حدث خطأ غير متوقع',
  message,
  retryLabel = 'إعادة المحاولة',
  onRetry,
  style,
}) => {
  const { direction } = useDirection();

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.errorIcon}>⚠️</Text>
      <Text style={[styles.title, { textAlign: getTextAlign('center', direction) }]}>
        {title}
      </Text>
      <Text
        style={[
          styles.message,
          { textAlign: getTextAlign('center', direction) },
        ]}
      >
        {message}
      </Text>
      {onRetry && (
        <Button
          label={retryLabel}
          variant="primary"
          size="sm"
          onPress={onRetry}
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
  errorIcon: {
    fontSize: 40,
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.semantic.error,
  },
  message: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    maxWidth: 320,
  },
  btn: {
    marginTop: spacing.sm,
  },
});
