import React from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ViewStyle,
  StyleProp,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { colors, spacing } from '../tokens';

export interface ScreenContainerProps {
  children: React.ReactNode;
  scrollable?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  withSafeArea?: boolean;
}

export const ScreenContainer: React.FC<ScreenContainerProps> = ({
  children,
  scrollable = true,
  style,
  contentContainerStyle,
  withSafeArea = true,
}) => {
  const Container = withSafeArea ? SafeAreaView : View;

  if (scrollable) {
    return (
      <Container style={[styles.container, style]}>
        <StatusBar barStyle="light-content" backgroundColor={colors.surfaces.background} />
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </Container>
    );
  }

  return (
    <Container style={[styles.container, style]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.surfaces.background} />
      <View style={[styles.staticContent, contentContainerStyle]}>{children}</View>
    </Container>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaces.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'],
  },
  staticContent: {
    flex: 1,
    padding: spacing.lg,
  },
});
