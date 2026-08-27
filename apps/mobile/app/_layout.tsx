import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { DirectionProvider, ToastProvider, colors } from '@o2/ui';

export default function RootLayout() {
  return (
    <DirectionProvider initialDirection="rtl">
      <ToastProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.surfaces.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </ToastProvider>
    </DirectionProvider>
  );
}
