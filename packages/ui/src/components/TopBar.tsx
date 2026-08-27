import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, typography } from '../tokens';
import { IconButton } from './IconButton';
import { useDirection, getTextAlign, getFlexDirection } from '../rtl';

export interface TopBarProps {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  leftAction?: React.ReactNode;
  rightAction?: React.ReactNode;
  style?: ViewStyle;
}

export const TopBar: React.FC<TopBarProps> = ({
  title,
  subtitle,
  onBack,
  leftAction,
  rightAction,
  style,
}) => {
  const { direction } = useDirection();

  const renderBackButton = () => {
    if (!onBack) return null;
    return (
      <IconButton
        icon={<Text style={styles.backIcon}>{direction === 'rtl' ? '➜' : '⬅'}</Text>}
        onPress={onBack}
        variant="ghost"
        size="sm"
      />
    );
  };

  return (
    <View
      style={[
        styles.container,
        { flexDirection: getFlexDirection('row', direction) },
        style,
      ]}
    >
      <View
        style={[
          styles.sideContainer,
          { flexDirection: getFlexDirection('row', direction) },
        ]}
      >
        {onBack ? renderBackButton() : leftAction}
      </View>

      <View style={styles.centerContainer}>
        {title && (
          <Text
            style={[styles.title, { textAlign: getTextAlign('center', direction) }]}
            numberOfLines={1}
          >
            {title}
          </Text>
        )}
        {subtitle && (
          <Text
            style={[
              styles.subtitle,
              { textAlign: getTextAlign('center', direction) },
            ]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        )}
      </View>

      <View
        style={[
          styles.sideContainer,
          {
            flexDirection: getFlexDirection('row', direction),
            justifyContent: 'flex-end',
          },
        ]}
      >
        {rightAction}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 56,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaces.background,
    borderBottomWidth: 1,
    borderColor: colors.surfaces.border,
  },
  sideContainer: {
    minWidth: 44,
    alignItems: 'center',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  title: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  subtitle: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize['2xs'],
    color: colors.text.secondary,
  },
  backIcon: {
    fontSize: typography.fontSize.md,
    color: colors.text.primary,
  },
});
