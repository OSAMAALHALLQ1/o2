import React from 'react';
import {
  Modal as RNModal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ViewStyle,
} from 'react-native';
import { colors, radius, spacing, typography, elevation } from '../tokens';
import { useDirection, getTextAlign } from '../rtl';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  contentStyle?: ViewStyle;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  visible,
  onClose,
  title,
  children,
  contentStyle,
}) => {
  const { direction } = useDirection();

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        activeOpacity={1}
        style={styles.backdrop}
        onPress={onClose}
      >
        <TouchableWithoutFeedback>
          <View style={[styles.sheet, contentStyle]}>
            <View style={styles.handle} />
            {title && (
              <Text
                style={[
                  styles.title,
                  { textAlign: getTextAlign('start', direction) },
                ]}
              >
                {title}
              </Text>
            )}
            <View style={styles.body}>{children}</View>
          </View>
        </TouchableWithoutFeedback>
      </TouchableOpacity>
    </RNModal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    backgroundColor: colors.surfaces.surfaceElevated,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.surfaces.borderHighlight,
    ...elevation.lg,
  },
  handle: {
    width: 48,
    height: 5,
    borderRadius: radius.full,
    backgroundColor: colors.surfaces.borderHighlight,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  body: {
    paddingVertical: spacing.xs,
  },
});
