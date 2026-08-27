import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  ScreenContainer,
  Card,
  Tabs,
  Badge,
  Button,
  colors,
  spacing,
  typography,
  radius,
  useToast,
} from '@o2/ui';
import { mockCosmetics } from '../../src/data/mockData';

type CategoryKey =
  | 'character'
  | 'outfits'
  | 'hats'
  | 'glasses'
  | 'accessories'
  | 'emotes'
  | 'effects'
  | 'frames'
  | 'titles';

export default function CollectionScreen() {
  const { showToast } = useToast();
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('hats');

  const categories = [
    { id: 'character' as CategoryKey, label: 'الرفيق 🐼' },
    { id: 'hats' as CategoryKey, label: 'القبعات 👑' },
    { id: 'outfits' as CategoryKey, label: 'الأزياء 👔' },
    { id: 'glasses' as CategoryKey, label: 'النظارات 🕶️' },
    { id: 'accessories' as CategoryKey, label: 'الإكسسوارات 🎒' },
    { id: 'emotes' as CategoryKey, label: 'التعبيرات 🎭' },
    { id: 'effects' as CategoryKey, label: 'المؤثرات ✨' },
    { id: 'frames' as CategoryKey, label: 'الإطارات 🖼️' },
    { id: 'titles' as CategoryKey, label: 'الألقاب 🏷️' },
  ];

  const handleEquip = (name: string) => {
    showToast({
      type: 'success',
      title: '✨ تم التجهيز',
      message: `تم تجهيز ${name} بنجاح!`,
    });
  };

  return (
    <ScreenContainer scrollable style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>🎒 خزانة المقتنيات والأزياء</Text>
        <Text style={styles.subtitle}>
          خصص مظهر رفيقك وإطار ملفك الشخصي بأندر العناصر المميزة
        </Text>
      </View>

      {/* Category Tabs */}
      <Tabs<CategoryKey>
        tabs={categories}
        activeTab={activeCategory}
        onTabChange={setActiveCategory}
        scrollable
      />

      {/* Cosmetics Grid */}
      <View style={styles.grid}>
        {mockCosmetics.map((item) => (
          <Card key={item.id} variant="elevated" style={styles.itemCard}>
            <View style={styles.itemPreviewBox}>
              <Text style={styles.itemEmoji}>{item.previewUri}</Text>
              <View style={styles.rarityBadge}>
                <Badge variant="rarity" rarity={item.rarity} label={item.rarity} size="sm" />
              </View>
            </View>

            <View style={styles.itemInfo}>
              <Text style={styles.itemName} numberOfLines={1}>
                {item.nameKey}
              </Text>
              {item.isEquipped ? (
                <Badge label="مُجهّز حالياً ✓" variant="success" size="sm" />
              ) : item.isOwned ? (
                <Button
                  label="تجهيز"
                  variant="secondary"
                  size="sm"
                  onPress={() => handleEquip(item.nameKey)}
                />
              ) : (
                <View style={styles.priceRow}>
                  <Text style={styles.priceText}>
                    {item.gemPrice ? `${item.gemPrice} 💎` : `${item.coinPrice} 🪙`}
                  </Text>
                  <Button
                    label="شراء"
                    variant="gold"
                    size="sm"
                    onPress={() =>
                      showToast({
                        type: 'info',
                        title: 'متجر O2',
                        message: 'سيتوفر متجر الأزياء في Phase 4.',
                      })
                    }
                  />
                </View>
              )}
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  itemCard: {
    width: '47%',
    gap: spacing.sm,
    padding: spacing.md,
    alignItems: 'center',
  },
  itemPreviewBox: {
    width: '100%',
    height: 90,
    backgroundColor: colors.surfaces.surfaceHighlight,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  itemEmoji: {
    fontSize: 42,
  },
  rarityBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  itemInfo: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.xs,
  },
  itemName: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    textAlign: 'center',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  priceText: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.xs,
    color: colors.brand.accent,
    fontWeight: typography.fontWeight.bold,
  },
});
