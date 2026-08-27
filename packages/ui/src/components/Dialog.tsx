import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Modal } from './Modal';
import { Button } from './Button';
import { colors, spacing, typography } from '../tokens';
import { useDirection, getTextAlign, getFlexDirection } from '../rtl';

export interface DialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  isDestructive?: boolean;
}

export const Dialog: React.FC<DialogProps> = ({
  visible,
  title,
  message,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  onConfirm,
  onCancel,
  isDestructive = false,
}) => {
  const { direction } = useDirection();

  return (
    <Modal visible={visible} onClose={onCancel || onConfirm}>
      <View style={styles.container}>
        <Text style={[styles.title, { textAlign: getTextAlign('start', direction) }]}>
          {title}
        </Text>
        <Text style={[styles.message, { textAlign: getTextAlign('start', direction) }]}>
          {message}
        </Text>
        <View
          style={[
            styles.actions,
            { flexDirection: getFlexDirection('row', direction) },
          ]}
        >
          {onCancel && (
            <Button
              label={cancelLabel}
              variant="secondary"
              size="sm"
              onPress={onCancel}
              style={styles.btn}
            />
          )}
          <Button
            label={confirmLabel}
            variant={isDestructive ? 'danger' : 'primary'}
            size="sm"
            onPress={onConfirm}
            style={styles.btn}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  title: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  message: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
    lineHeight: typography.fontSize.md * typography.lineHeight.normal,
  },
  actions: {
    marginTop: spacing.md,
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  btn: {
    minWidth: 90,
  },
});
