import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  ScreenContainer,
  Card,
  Button,
  Badge,
  colors,
  spacing,
  typography,
  radius,
  useToast,
} from '@o2/ui';
import { mockGames } from '../../src/data/mockData';

export default function PlayScreen() {
  const { showToast } = useToast();

  const handleGameSelect = (gameTitle: string) => {
    showToast({
      type: 'info',
      title: `🎮 ${gameTitle}`,
      message: 'محرك اللعبة قيد التطوير في المراحل القادمة (Phase 7 & 8).',
    });
  };

  const getGameEmoji = (slug: string) => {
    switch (slug) {
      case 'atrash':
        return '👰';
      case 'mafia':
        return '🕵️‍♂️';
      case 'tarneeb':
        return '♠️';
      case 'hide_seek':
        return '🫣';
      case 'imposter_sabotage':
        return '🍔';
      default:
        return '🎮';
    }
  };

  return (
    <ScreenContainer scrollable style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>🕹️ صالة الألعاب الجماعية</Text>
        <Text style={styles.subtitle}>
          اختر لعبتك المفضلة والعب مع أصدقائك أو نافس لاعبين حقيقيين
        </Text>
      </View>

      {/* Matchmaking Mode Badge */}
      <View style={styles.bannerContainer}>
        <Card variant="highlight" style={styles.banner}>
          <Text style={styles.bannerIcon}>⚡</Text>
          <View style={styles.bannerContent}>
            <Text style={styles.bannerTitle}>مطابقة حقيقية ومضمونة</Text>
            <Text style={styles.bannerDesc}>
              ألعاب عادلة بنظام الأدوار الصارمة وبدون روبوتات وهمية
            </Text>
          </View>
        </Card>
      </View>

      {/* Game Cards List */}
      <View style={styles.gamesList}>
        {mockGames.map((game) => (
          <Card
            key={game.slug}
            variant="elevated"
            style={styles.gameCard}
            onPress={() => handleGameSelect(game.nameKey)}
          >
            <View style={styles.gameTopRow}>
              <View style={styles.gameIconBox}>
                <Text style={styles.gameEmoji}>{getGameEmoji(game.slug)}</Text>
              </View>
              <View style={styles.gameHeaderInfo}>
                <Text style={styles.gameName}>{game.nameKey}</Text>
                <View style={styles.gameBadges}>
                  <Badge
                    label={`${game.publicMatchCount} لاعبين`}
                    variant="primary"
                    size="sm"
                  />
                  {game.badge && (
                    <Badge label={game.badge} variant="gold" size="sm" />
                  )}
                </View>
              </View>
            </View>

            <Text style={styles.gameDesc}>{game.descriptionKey}</Text>

            <View style={styles.gameActionRow}>
              <Button
                label="دخول المطابقة السريعة"
                variant="primary"
                size="sm"
                onPress={() => handleGameSelect(game.nameKey)}
                style={styles.playBtn}
              />
              <Button
                label="غرفة خاصة"
                variant="secondary"
                size="sm"
                onPress={() => handleGameSelect(game.nameKey)}
                style={styles.privateBtn}
              />
            </View>
          </Card>
        ))}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xxs,
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  subtitle: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  bannerContainer: {
    marginBottom: spacing.xs,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  bannerIcon: {
    fontSize: 28,
  },
  bannerContent: {
    flex: 1,
    gap: 2,
  },
  bannerTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.brand.accent,
  },
  bannerDesc: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  gamesList: {
    gap: spacing.md,
  },
  gameCard: {
    gap: spacing.md,
  },
  gameTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  gameIconBox: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaces.surfaceHighlight,
    borderWidth: 1,
    borderColor: colors.surfaces.borderHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameEmoji: {
    fontSize: 28,
  },
  gameHeaderInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  gameName: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  gameBadges: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  gameDesc: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  gameActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  playBtn: {
    flex: 1,
  },
  privateBtn: {
    minWidth: 100,
  },
});
