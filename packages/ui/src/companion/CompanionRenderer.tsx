import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
  Animated,
} from 'react-native';
import {
  CompanionMood,
  CompanionAnimation,
  CompanionExpression,
  CompanionReaction,
} from '@o2/types';
import { colors, radius, spacing, typography, elevation } from '../tokens';

export interface CompanionEquippedCosmetics {
  headSlug?: string;
  faceSlug?: string;
  bodySlug?: string;
  backSlug?: string;
  auraSlug?: string;
  nameFrameSlug?: string;
  hatSlug?: string;
}

export interface CompanionRendererProps {
  characterSlug?: string;
  expression?: CompanionExpression;
  mood?: CompanionMood;
  reaction?: CompanionReaction | null;
  equippedCosmetics?: CompanionEquippedCosmetics;
  currentAnimation?: CompanionAnimation;
  isSleeping?: boolean;
  onTap?: () => void;
  scale?: number;
  style?: ViewStyle;
}

export const CompanionRenderer: React.FC<CompanionRendererProps> = ({
  characterSlug = 'panda_bamboo_master',
  expression = 'HAPPY',
  mood: _mood = 'happy',
  reaction = null,
  equippedCosmetics,
  currentAnimation: _currentAnimation = 'idle',
  isSleeping = false,
  onTap,
  scale = 1,
  style,
}) => {
  const floatAnim = useRef(new Animated.Value(0)).current;
  const reactionAnim = useRef(new Animated.Value(0)).current;

  // Gentle idle floating animation
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -6,
          duration: 1600,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 1600,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [floatAnim]);

  // Reaction pop animation
  useEffect(() => {
    if (reaction) {
      reactionAnim.setValue(0);
      Animated.spring(reactionAnim, {
        toValue: 1,
        friction: 4,
        tension: 40,
        useNativeDriver: true,
      }).start();
    }
  }, [reaction, reactionAnim]);

  const getMascotEmoji = (slug: string): string => {
    switch (slug) {
      case 'panda_bamboo_master':
      case 'panda_mascot':
      case 'panda':
        return '🐼';
      case 'koala_cloud_sleeper':
      case 'koala_mascot':
      case 'koala':
        return '🐨';
      case 'falcon_desert_scout':
        return '🦅';
      case 'fennec_dune_hopper':
      case 'fox_mascot':
      case 'fox':
        return '🦊';
      case 'orca_wave_rider':
        return '🐋';
      case 'camel_oasis_wanderer':
        return '🐪';
      case 'lion_savanna_sentinel':
        return '🦁';
      case 'owl_star_astronomer':
        return '🦉';
      case 'tiger_ember_striker':
        return '🐯';
      case 'rabbit_meadow_sprinter':
      case 'bunny_mascot':
      case 'bunny':
        return '🐰';
      case 'penguin_glacier_slider':
      case 'penguin_mascot':
      case 'penguin':
        return '🐧';
      case 'dragon_mystic_guardian':
      case 'dino_mascot':
      case 'dino':
        return '🐲';
      case 'cheetah_speed_champion':
        return '🐆';
      case 'dolphin_coral_dancer':
        return '🐬';
      case 'elephant_mountain_shield':
        return '🐘';
      case 'wolf_aurora_howler':
        return '🐺';
      case 'chameleon_prism_shifter':
        return '🦎';
      case 'bear_honey_forager':
      case 'bear_mascot':
      case 'bear':
        return '🐻';
      case 'otter_stream_juggler':
        return '🦦';
      case 'peacock_royal_feather':
        return '🦚';
      default:
        return '🐼';
    }
  };

  const getExpressionBadge = (expr: CompanionExpression, sleeping: boolean) => {
    if (sleeping || expr === 'SLEEPING') {
      return { emoji: '💤😴', label: 'نائم في هدوء' };
    }
    switch (expr) {
      case 'VERY_HAPPY':
        return { emoji: '✨😍✨', label: 'في قمة السعادة!' };
      case 'HAPPY':
        return { emoji: '😊', label: 'مبتهج وراضٍ' };
      case 'HUNGRY':
        return { emoji: '🤤🍗', label: 'يشعر بالجوع' };
      case 'DIRTY':
        return { emoji: '🫧🛁', label: 'يحتاج حماماً' };
      case 'TIRED':
        return { emoji: '🥱⚡', label: 'طاقتي منخفضة' };
      case 'NEUTRAL':
      default:
        return { emoji: '🙂', label: 'مستقر وهادئ' };
    }
  };

  const getReactionParticles = (react: CompanionReaction | null) => {
    if (!react) return null;
    switch (react) {
      case 'FED':
        return '🍗✨ لذيذ جداً!';
      case 'BATHED':
        return '🛁🫧 نظيف ومنتعش!';
      case 'PLAYED':
        return '🎮⭐ لعبنا واستمتعنا!';
      case 'PETTED':
        return '💖🥰 مداعبة لطيفة!';
      case 'FELL_ASLEEP':
        return '🌙💤 أحلاماً سعيدة!';
      case 'WOKE_UP':
        return '☀️✨ صباح النشاط!';
      default:
        return '💖✨';
    }
  };

  const mascotEmoji = getMascotEmoji(characterSlug);
  const badgeInfo = getExpressionBadge(expression, isSleeping);
  const reactionText = getReactionParticles(reaction);

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
      <View
        style={[
          styles.aura,
          isSleeping ? styles.auraSleeping : styles.auraAwake,
        ]}
      />

      {/* Floating Mascot Container */}
      <Animated.View
        style={[
          styles.mascotFloatingWrapper,
          { transform: [{ translateY: isSleeping ? 0 : floatAnim }] },
        ]}
      >
        {/* Aura particle layer */}
        {equippedCosmetics?.auraSlug && (
          <View style={styles.auraSparkleLayer}>
            <Text style={styles.auraSparkleEmoji}>✨</Text>
          </View>
        )}

        {/* Back Accessory Layer */}
        {equippedCosmetics?.backSlug && (
          <View style={styles.backLayer}>
            <Text style={styles.backEmoji}>🎒</Text>
          </View>
        )}

        {/* Head Cosmetic Accessory Layer */}
        {(equippedCosmetics?.headSlug || equippedCosmetics?.hatSlug) && (
          <View style={styles.hatLayer}>
            <Text style={styles.hatEmoji}>
              {equippedCosmetics.headSlug?.includes('headphone')
                ? '🎧'
                : equippedCosmetics.headSlug?.includes('cap')
                ? '🧢'
                : '👑'}
            </Text>
          </View>
        )}

        {/* Mascot Body Circle */}
        <View
          style={[
            styles.mascotBody,
            isSleeping && styles.mascotBodySleeping,
            equippedCosmetics?.nameFrameSlug && styles.mascotBodyGoldFrame,
          ]}
        >
          <Text style={styles.mascotEmoji}>{mascotEmoji}</Text>

          {/* Face cosmetic overlay */}
          {equippedCosmetics?.faceSlug && (
            <View style={styles.faceLayer}>
              <Text style={styles.faceEmoji}>🕶️</Text>
            </View>
          )}

          {/* Body outfit overlay */}
          {equippedCosmetics?.bodySlug && (
            <View style={styles.bodyLayer}>
              <Text style={styles.bodyEmoji}>👔</Text>
            </View>
          )}
        </View>

        {/* Expression Badge */}
        <View style={styles.expressionBadge}>
          <Text style={styles.expressionEmoji}>{badgeInfo.emoji}</Text>
        </View>
      </Animated.View>

      {/* Floating Reaction Overlay */}
      {reactionText && (
        <Animated.View
          style={[
            styles.reactionOverlay,
            {
              opacity: reactionAnim.interpolate({
                inputRange: [0, 0.2, 0.8, 1],
                outputRange: [0, 1, 1, 0],
              }),
              transform: [
                {
                  translateY: reactionAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [10, -30],
                  }),
                },
                {
                  scale: reactionAnim.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0.8, 1.1, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={styles.reactionText}>{reactionText}</Text>
        </Animated.View>
      )}

      {/* Status Description Pill */}
      <View style={styles.statusPill}>
        <Text style={styles.statusPillText}>{badgeInfo.label}</Text>
      </View>
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
    width: 220,
    height: 220,
    position: 'relative',
  },
  aura: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: radius.full,
  },
  auraAwake: {
    backgroundColor: colors.brand.primary,
    opacity: 0.18,
    ...elevation.glowRed,
  },
  auraSleeping: {
    backgroundColor: colors.rarity.epic,
    opacity: 0.22,
    ...elevation.glowGold,
  },
  mascotFloatingWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hatLayer: {
    position: 'absolute',
    top: -16,
    zIndex: 10,
  },
  hatEmoji: {
    fontSize: 34,
  },
  mascotBody: {
    width: 144,
    height: 144,
    borderRadius: radius.full,
    backgroundColor: colors.surfaces.surfaceElevated,
    borderWidth: 2.5,
    borderColor: colors.surfaces.borderHighlight,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.md,
  },
  mascotBodySleeping: {
    borderColor: colors.rarity.epic,
    backgroundColor: '#16132b',
    opacity: 0.92,
  },
  mascotBodyGoldFrame: {
    borderColor: colors.rarity.epic,
    borderWidth: 4,
    ...elevation.glowGold,
  },
  auraSparkleLayer: {
    position: 'absolute',
    top: -24,
    right: -10,
    zIndex: 5,
  },
  auraSparkleEmoji: {
    fontSize: 28,
  },
  backLayer: {
    position: 'absolute',
    bottom: 10,
    left: -12,
    zIndex: 2,
  },
  backEmoji: {
    fontSize: 30,
  },
  faceLayer: {
    position: 'absolute',
    top: 48,
    zIndex: 12,
  },
  faceEmoji: {
    fontSize: 26,
  },
  bodyLayer: {
    position: 'absolute',
    bottom: 10,
    zIndex: 11,
  },
  bodyEmoji: {
    fontSize: 24,
  },
  mascotEmoji: {
    fontSize: 74,
  },
  expressionBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: colors.surfaces.surfaceElevated,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 3,
    borderWidth: 1.5,
    borderColor: colors.surfaces.borderHighlight,
    ...elevation.sm,
  },
  expressionEmoji: {
    fontSize: typography.fontSize.sm,
  },
  reactionOverlay: {
    position: 'absolute',
    top: 10,
    backgroundColor: colors.brand.accent,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    zIndex: 20,
    ...elevation.glowGold,
  },
  reactionText: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.xs,
    color: '#000000',
    fontWeight: typography.fontWeight.bold,
  },
  statusPill: {
    position: 'absolute',
    bottom: 2,
    backgroundColor: colors.surfaces.surfaceHighlight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.surfaces.border,
  },
  statusPillText: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize['2xs'],
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.bold,
  },
});
