import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { DirectionProvider, ToastProvider, colors } from '@o2/ui';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { CompanionProvider } from '../src/context/CompanionContext';

function RootNavigation() {
  const { authState } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (authState === 'booting') return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboardingGroup = segments[0] === '(onboarding)';

    if (authState === 'unauthenticated' && !inAuthGroup) {
      router.replace('/(auth)/welcome');
    } else if (authState === 'onboarding_username' && segments[1] !== 'username') {
      router.replace('/(onboarding)/username');
    } else if (authState === 'onboarding_companion' && segments[1] !== 'companion') {
      router.replace('/(onboarding)/companion');
    } else if (authState === 'authenticated' && (inAuthGroup || inOnboardingGroup)) {
      router.replace('/(tabs)');
    }
  }, [authState, segments, router]);

  if (authState === 'booting') {
    return (
      <View style={styles.bootContainer}>
        <ActivityIndicator size="large" color={colors.brand.primary} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surfaces.background },
      }}
    >
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <DirectionProvider initialDirection="rtl">
      <ToastProvider>
        <AuthProvider>
          <CompanionProvider>
            <StatusBar style="light" />
            <RootNavigation />
          </CompanionProvider>
        </AuthProvider>
      </ToastProvider>
    </DirectionProvider>
  );
}

const styles = StyleSheet.create({
  bootContainer: {
    flex: 1,
    backgroundColor: colors.surfaces.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
