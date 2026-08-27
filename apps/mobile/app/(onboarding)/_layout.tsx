import React from 'react';
import { Stack } from 'expo-router';
import { colors } from '@o2/ui';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surfaces.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="username" />
      <Stack.Screen name="companion" />
    </Stack>
  );
}
