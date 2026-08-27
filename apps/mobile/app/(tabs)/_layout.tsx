import React from 'react';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors, typography } from '@o2/ui';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surfaces.surface,
          borderTopColor: colors.surfaces.border,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.brand.primary,
        tabBarInactiveTintColor: colors.text.secondary,
        tabBarLabelStyle: {
          fontFamily: typography.fontFamily.heading,
          fontSize: 11,
          fontWeight: '700',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'الرئيسية',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>🏠</Text>,
        }}
      />
      <Tabs.Screen
        name="play"
        options={{
          title: 'الألعاب',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>🎮</Text>,
        }}
      />
      <Tabs.Screen
        name="order"
        options={{
          title: 'طلب O2',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>🍔</Text>,
        }}
      />
      <Tabs.Screen
        name="collection"
        options={{
          title: 'المقتنيات',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>🎒</Text>,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'الملف',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>👤</Text>,
        }}
      />
    </Tabs>
  );
}
