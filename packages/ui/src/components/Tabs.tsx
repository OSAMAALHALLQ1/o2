import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { colors, radius, spacing, typography } from '../tokens';
import { useDirection, getFlexDirection } from '../rtl';

export interface TabItem<T = string> {
  id: T;
  label: string;
  badge?: string | number;
  icon?: React.ReactNode;
}

export interface TabsProps<T = string> {
  tabs: TabItem<T>[];
  activeTab: T;
  onTabChange: (tabId: T) => void;
  scrollable?: boolean;
  style?: ViewStyle;
}

export const Tabs = <T extends string = string>({
  tabs,
  activeTab,
  onTabChange,
  scrollable = false,
  style,
}: TabsProps<T>) => {
  const { direction } = useDirection();

  const renderTabItems = () => (
    <View
      style={[
        styles.container,
        { flexDirection: getFlexDirection('row', direction) },
        style,
      ]}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <TouchableOpacity
            key={tab.id}
            onPress={() => onTabChange(tab.id)}
            activeOpacity={0.7}
            style={[
              styles.tab,
              isActive && styles.activeTab,
              { flexDirection: getFlexDirection('row', direction) },
            ]}
          >
            {tab.icon}
            <Text style={[styles.label, isActive && styles.activeLabel]}>
              {tab.label}
            </Text>
            {tab.badge !== undefined && (
              <View style={[styles.badge, isActive && styles.activeBadge]}>
                <Text style={styles.badgeText}>{tab.badge}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {renderTabItems()}
      </ScrollView>
    );
  }

  return renderTabItems();
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaces.surface,
    borderRadius: radius.md,
    padding: spacing.xxs + 2,
    gap: spacing.xs,
  },
  scrollContent: {
    paddingVertical: spacing.xs,
  },
  tab: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  activeTab: {
    backgroundColor: colors.surfaces.surfaceHighlight,
    borderWidth: 1,
    borderColor: colors.surfaces.borderHighlight,
  },
  label: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.medium,
  },
  activeLabel: {
    color: colors.text.primary,
    fontWeight: typography.fontWeight.bold,
  },
  badge: {
    backgroundColor: colors.surfaces.surfaceHighlight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
  },
  activeBadge: {
    backgroundColor: colors.brand.primary,
  },
  badgeText: {
    fontSize: typography.fontSize['2xs'],
    color: colors.text.primary,
    fontWeight: typography.fontWeight.bold,
  },
});
