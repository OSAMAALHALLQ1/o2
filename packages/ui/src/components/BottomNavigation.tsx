import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { colors, radius, spacing, typography } from '../tokens';
import { useDirection, getFlexDirection } from '../rtl';

export type MainTabKey = 'home' | 'play' | 'order' | 'collection' | 'profile';

export interface NavItem {
  key: MainTabKey;
  label: string;
  icon: string;
  badge?: number | string;
}

export const MAIN_NAV_ITEMS: NavItem[] = [
  { key: 'home', label: 'الرئيسية', icon: '🏠' },
  { key: 'play', label: 'الألعاب', icon: '🎮' },
  { key: 'order', label: 'طلب O2', icon: '🍔' },
  { key: 'collection', label: 'المقتنيات', icon: '🎒' },
  { key: 'profile', label: 'الملف', icon: '👤' },
];

export interface BottomNavigationProps {
  activeKey: MainTabKey;
  onSelect: (key: MainTabKey) => void;
  style?: ViewStyle;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  activeKey,
  onSelect,
  style,
}) => {
  const { direction } = useDirection();

  return (
    <View
      style={[
        styles.container,
        { flexDirection: getFlexDirection('row', direction) },
        style,
      ]}
    >
      {MAIN_NAV_ITEMS.map((item) => {
        const isActive = activeKey === item.key;
        return (
          <TouchableOpacity
            key={item.key}
            onPress={() => onSelect(item.key)}
            activeOpacity={0.7}
            style={[styles.item, isActive && styles.activeItem]}
          >
            <Text style={[styles.icon, isActive && styles.activeIcon]}>
              {item.icon}
            </Text>
            <Text style={[styles.label, isActive && styles.activeLabel]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 64,
    backgroundColor: colors.surfaces.surface,
    borderTopWidth: 1,
    borderColor: colors.surfaces.border,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    gap: 2,
    borderRadius: radius.md,
  },
  activeItem: {
    backgroundColor: colors.surfaces.surfaceHighlight,
  },
  icon: {
    fontSize: 20,
    opacity: 0.6,
  },
  activeIcon: {
    opacity: 1,
  },
  label: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize['2xs'],
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.medium,
  },
  activeLabel: {
    color: colors.brand.primary,
    fontWeight: typography.fontWeight.bold,
  },
});
