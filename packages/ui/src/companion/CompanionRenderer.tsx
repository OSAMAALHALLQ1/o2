import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { CompanionRenderProps, CompanionMood, CompanionAnimation } from '@o2/types';
import { colors, radius, spacing, typography, elevation } from '../tokens';

export interface CompanionRendererProps extends CompanionRenderProps {
  style?: ViewStyle;
}

export const CompanionRenderer: React.FC<CompanionRendererProps> = ({
  characterSlug,
  mood = 'happy',
  equippedCosmetics,
  currentAnimation = 'idle',
  onTap,
  scale = 1,
  style,
}) => {
  const getMascotEmoji = (slug: string): string => {
    switch (slug) {
      case 'panda_mascot':
      case 'panda':
        return '🐼';
      case 'koala_mascot':
      case 'koala':
        return '🐨';
      case 'bunny_mascot':
      case 'bunny':
        return '🐰';
      case 'fox_mascot':
      case 'fox':
        return '🦊';
      case 'cat_mascot':
      case 'cat':
        return '🐱';
      case 'bear_mascot':
      case 'bear':
        return '🐻';
      case 'penguin_mascot':
      case 'penguin':
        return '🐧';
      case 'dino_mascot':
      case 'dino':
        return '🦖';
      default:
        return '🐼';
    }
  };

  const getMoodEmoji = (m: CompanionMood): string => {
    switch (m) {
      case 'ecstatic':
        return '✨😍✨';
      case 'happy':
        return '😊';
      case 'neutral':
        return '😐';
      case 'sleepy':
        return '😴';
      case 'pouty':
        return '🥺';
      default:
        return '😊';
    }
  };

  const getAnimationLabel = (anim: CompanionAnimation): string => {
    switch (anim) {
      case 'eat':
        return '🍗 يأكل';
      case 'bath':
        return '🛁 يستحم';
      case 'sleep':
        return '💤 نائم';
      case 'cheer':
        return '🎉 يهتف';
      case 'dance':
        return '💃 يرقص';
      case 'wave':
        return '👋 يلوح';
      case 'idle':
      default:
        return 'مستعد';
    }
  };

  const mascotEmoji = getMascotEmoji(characterSlug);
  const moodEmoji = getMoodEmoji(mood);
  const animationLabel = getAnimationLabel(currentAnimation);

  const content = (
    <View
      style={[
        styles.container,
        {
          transform: [{ scale }],
        },
        style,
      ]}
    >
      {/* Visual Aura / Background Glow */}
      <View style={styles.aura} />

      {/* Cosmetics Accessories Layer Placeholder */}
      {equippedCosmetics?.hatSlug && (
        <View style={styles.hatLayer}>
          <Text style={styles.hatEmoji}>👑</Text>
        </View>
      )}

      {/* Mascot 2D/3D Rendering Abstraction Root */}
      <View style={styles.mascotBody}>
        <Text style={styles.mascotEmoji}>{mascotEmoji}</Text>
      </View>

      {/* Mood Badge */}
      <View style={styles.moodBadge}>
        <Text style={styles.moodText}>{moodEmoji}</Text>
      </View>

      {/* Active Animation State Pill */}
      {currentAnimation !== 'idle' && (
        <View style={styles.animPill}>
          <Text style={styles.animText}>{animationLabel}</Text>
        </View>
      )}
    </View>
  );

  if (onTap) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onTap}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 200,
    height: 200,
    position: 'relative',
  },
  aura: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
    opacity: 0.15,
    ...elevation.glowRed,
  },
  hatLayer: {
    position: 'absolute',
    top: 15,
    zIndex: 10,
  },
  hatEmoji: {
    fontSize: 32,
  },
  mascotBody: {
    width: 140,
    height: 140,
    borderRadius: radius.full,
    backgroundColor: colors.surfaces.surfaceElevated,
    borderWidth: 2,
    borderColor: colors.surfaces.borderHighlight,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.md,
  },
  mascotEmoji: {
    fontSize: 72,
  },
  moodBadge: {
    position: 'absolute',
    bottom: 25,
    right: 25,
    backgroundColor: colors.surfaces.surfaceHighlight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.surfaces.border,
  },
  moodText: {
    fontSize: typography.fontSize.sm,
  },
  animPill: {
    position: 'absolute',
    bottom: 0,
    backgroundColor: colors.brand.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  animText: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize['2xs'],
    color: colors.text.primary,
    fontWeight: typography.fontWeight.bold,
  },
});
