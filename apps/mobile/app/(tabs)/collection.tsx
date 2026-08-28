import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import {
  ScreenContainer,
  Card,
  Tabs,
  Badge,
  Button,
  CurrencyBar,
  colors,
  spacing,
  typography,
  radius,
  useToast,
} from '@o2/ui';
import { useEconomy } from '../../src/context/EconomyContext';
import { CosmeticSlot, ItemRarity } from '@o2/types';

type MainSection = 'COLLECTION' | 'SHOP';
type CategoryFilter = 'ALL' | 'CONSUMABLES' | 'HEAD' | 'FACE' | 'BODY' | 'BACK' | 'AURA' | 'NAME_FRAME';

export default function CollectionScreen() {
  const { showToast } = useToast();
  const {
    coins,
    gems,
    eventTokens,
    inventory,
    equippedCosmetics,
    shopOffers,
    isLoading,
    isPurchasing,
    purchaseOffer,
    useConsumable,
    equipCosmetic,
    unequipCosmetic,
  } = useEconomy();

  const [activeSection, setActiveSection] = useState<MainSection>('COLLECTION');
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>('ALL');

  const mainTabs = [
    { id: 'COLLECTION' as MainSection, label: '🎒 خزانة المقتنيات' },
    { id: 'SHOP' as MainSection, label: '🏪 متجر O2' },
  ];

  const categoryFilters = [
    { id: 'ALL' as CategoryFilter, label: 'الكل ✨' },
    { id: 'CONSUMABLES' as CategoryFilter, label: 'الأطعمة 🍗' },
    { id: 'HEAD' as CategoryFilter, label: 'القبعات 👑' },
    { id: 'FACE' as CategoryFilter, label: 'النظارات 🕶️' },
    { id: 'BODY' as CategoryFilter, label: 'الأزياء 👔' },
    { id: 'BACK' as CategoryFilter, label: 'الحقائب 🎒' },
    { id: 'AURA' as CategoryFilter, label: 'الهالات 🌟' },
    { id: 'NAME_FRAME' as CategoryFilter, label: 'الإطارات 🖼️' },
  ];

  const getItemEmoji = (assetKey: string, slot: CosmeticSlot | null, type: string): string => {
    if (type === 'CONSUMABLE') {
      if (assetKey.includes('shawarma')) return '🌯';
      if (assetKey.includes('pizza')) return '🍕';
      if (assetKey.includes('fries')) return '🍟';
      if (assetKey.includes('burger')) return '🍔';
      if (assetKey.includes('gelato')) return '🍨';
      return '🍗';
    }
    switch (slot) {
      case 'HEAD':
        return assetKey.includes('headphone') ? '🎧' : '🧢';
      case 'FACE':
        return '🕶️';
      case 'BODY':
        return '👔';
      case 'BACK':
        return '🎒';
      case 'AURA':
        return '✨';
      case 'NAME_FRAME':
        return '🖼️';
      default:
        return '🎁';
    }
  };

  const handleEquipToggle = async (itemId: string, slot: CosmeticSlot | null, isCurrentlyEquipped: boolean) => {
    if (!slot) return;
    try {
      if (isCurrentlyEquipped) {
        await unequipCosmetic(slot);
        showToast({
          type: 'info',
          title: 'إلغاء التجهيز',
          message: 'تمت إزالة الزي بنجاح.',
        });
      } else {
        await equipCosmetic(itemId);
        showToast({
          type: 'success',
          title: '✨ تم التجهيز',
          message: 'تم تجهيز العنصر على رفيقك بنجاح!',
        });
      }
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'خطأ',
        message: err.message || 'تعذر تغيير الزي حالياً.',
      });
    }
  };

  const handleUseConsumable = async (itemId: string, name: string) => {
    try {
      await useConsumable(itemId);
      showToast({
        type: 'success',
        title: '🍗 وجبة شهية!',
        message: `استمتع رفيقك بـ ${name} وزادت طاقته وسعادته!`,
      });
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'خطأ',
        message: err.message || 'تعذر استخدام العنصر حالياً.',
      });
    }
  };

  const handleBuyOffer = async (offer: any) => {
    const isGems = offer.currencyKind === 'GEM';
    const eventBalance = eventTokens.find(
      (token) => token.scopeType === offer.currencyScopeType && token.scopeId === offer.currencyScopeId,
    )?.balance ?? 0;
    const userBalance = isGems ? gems : offer.currencyKind === 'EVENT_TOKEN' ? eventBalance : coins;
    const currencyLabel = isGems ? 'جوهرة 💎' : offer.currencyKind === 'EVENT_TOKEN' ? 'رمز فعالية 🎟️' : 'عملة 🪙';

    if (userBalance < offer.priceAmount) {
      showToast({
        type: 'error',
        title: 'رصيد غير كافٍ',
        message: `تحتاج إلى ${offer.priceAmount} ${currencyLabel} لإتمام الشراء.`,
      });
      return;
    }

    try {
      await purchaseOffer(offer.id);
      showToast({
        type: 'success',
        title: '🎉 مبروك!',
        message: `تم شراء ${offer.item.nameAr} وإضافته إلى خزانتك!`,
      });
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'فشل الشراء',
        message: err.message || 'تعذر إتمام عملية الشراء.',
      });
    }
  };

  const filteredInventory = inventory.filter((inv) => {
    if (activeFilter === 'ALL') return true;
    if (activeFilter === 'CONSUMABLES') return inv.item.type === 'CONSUMABLE';
    return inv.item.cosmeticSlot === activeFilter;
  });

  const filteredOffers = shopOffers.filter((offer) => {
    if (activeFilter === 'ALL') return true;
    if (activeFilter === 'CONSUMABLES') return offer.item.type === 'CONSUMABLE';
    return offer.item.cosmeticSlot === activeFilter;
  });

  return (
    <ScreenContainer scrollable style={styles.container}>
      {/* Header & Currency Bar */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.title}>
            {activeSection === 'COLLECTION' ? '🎒 خزانة المقتنيات' : '🏪 متجر O2 الرسمي'}
          </Text>
          <CurrencyBar
            coins={coins}
            gems={gems}
            eventTokens={eventTokens?.[0]?.balance}
          />
        </View>
        <Text style={styles.subtitle}>
          {activeSection === 'COLLECTION'
            ? 'أدر أزياء رفيقك وإطارات ملفك الشخصي واستمتع بالأطعمة اللذيذة'
            : 'استبدل عملاتك وجواهرك بأندر المقتنيات والأزياء الحصرية'}
        </Text>
      </View>

      {/* Main Mode Sub-Tabs (Collection vs Shop) */}
      <Tabs<MainSection>
        tabs={mainTabs}
        activeTab={activeSection}
        onTabChange={setActiveSection}
      />

      {/* Category Filter Pills */}
      <Tabs<CategoryFilter>
        tabs={categoryFilters}
        activeTab={activeFilter}
        onTabChange={setActiveFilter}
        scrollable
      />

      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.brand.primary} />
        </View>
      )}

      {/* SECTION 1: INVENTORY / COLLECTION */}
      {activeSection === 'COLLECTION' && !isLoading && (
        <View style={styles.grid}>
          {filteredInventory.length === 0 ? (
            <Card variant="default" style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>📦</Text>
              <Text style={styles.emptyTitle}>لا توجد عناصر في هذا القسم</Text>
              <Text style={styles.emptySubtitle}>تفضل بزيارة متجر O2 واقتنِ أروع الأزياء والأطعمة!</Text>
              <Button
                label="افتح متجر O2 🏪"
                variant="primary"
                size="md"
                onPress={() => setActiveSection('SHOP')}
              />
            </Card>
          ) : (
            filteredInventory.map((inv) => {
              const isEquipped =
                inv.item.cosmeticSlot &&
                equippedCosmetics[inv.item.cosmeticSlot]?.itemId === inv.itemId;

              return (
                <Card key={inv.id} variant="elevated" style={styles.itemCard}>
                  <View style={styles.itemPreviewBox}>
                    <Text style={styles.itemEmoji}>
                      {getItemEmoji(inv.item.assetKey, inv.item.cosmeticSlot, inv.item.type)}
                    </Text>
                    <View style={styles.rarityBadge}>
                      <Badge variant="rarity" rarity={inv.item.rarity as ItemRarity} label={inv.item.rarity} size="sm" />
                    </View>
                    {inv.item.isStackable && (
                      <View style={styles.quantityBadge}>
                        <Text style={styles.quantityText}>x{inv.quantity}</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {inv.item.nameAr}
                    </Text>
                    <Text style={styles.itemDesc} numberOfLines={2}>
                      {inv.item.descriptionAr}
                    </Text>

                    {inv.item.type === 'CONSUMABLE' ? (
                      <Button
                        label="استخدام 🍗"
                        variant="secondary"
                        size="sm"
                        style={styles.actionBtn}
                        onPress={() => handleUseConsumable(inv.itemId, inv.item.nameAr)}
                      />
                    ) : (
                      <Button
                        label={isEquipped ? 'مُجهّز ✓' : 'تجهيز'}
                        variant={isEquipped ? 'outline' : 'primary'}
                        size="sm"
                        style={styles.actionBtn}
                        onPress={() => handleEquipToggle(inv.itemId, inv.item.cosmeticSlot, Boolean(isEquipped))}
                      />
                    )}
                  </View>
                </Card>
              );
            })
          )}
        </View>
      )}

      {/* SECTION 2: SHOP OFFERS */}
      {activeSection === 'SHOP' && !isLoading && (
        <View style={styles.grid}>
          {filteredOffers.length === 0 ? (
            <Card variant="default" style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>🏪</Text>
              <Text style={styles.emptyTitle}>لا توجد عروض متوفرة حالياً</Text>
              <Text style={styles.emptySubtitle}>تابعنا قريباً لعروض ومواسم حصرية جديدة!</Text>
            </Card>
          ) : (
            filteredOffers.map((offer) => {
              const isGems = offer.currencyKind === 'GEM';
              const isEventToken = offer.currencyKind === 'EVENT_TOKEN';
              const isOwnedCosmetic =
                offer.item.type === 'COSMETIC' &&
                inventory.some((inv) => inv.itemId === offer.itemId && inv.quantity >= 1);

              return (
                <Card key={offer.id} variant="elevated" style={styles.itemCard}>
                  <View style={styles.itemPreviewBox}>
                    <Text style={styles.itemEmoji}>
                      {getItemEmoji(offer.item.assetKey, offer.item.cosmeticSlot, offer.item.type)}
                    </Text>
                    <View style={styles.rarityBadge}>
                      <Badge variant="rarity" rarity={offer.item.rarity as ItemRarity} label={offer.item.rarity} size="sm" />
                    </View>
                  </View>

                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {offer.item.nameAr}
                    </Text>
                    <Text style={styles.itemDesc} numberOfLines={2}>
                      {offer.item.descriptionAr}
                    </Text>

                    <View style={styles.priceRow}>
                      <Text style={isGems ? styles.gemPriceText : styles.coinPriceText}>
                        {offer.priceAmount} {isGems ? '💎' : isEventToken ? '🎟️' : '🪙'}
                      </Text>

                      {isOwnedCosmetic ? (
                        <Badge label="مملوك ✓" variant="secondary" size="sm" />
                      ) : (
                        <Button
                          label="شراء"
                          variant={isGems ? 'gold' : 'primary'}
                          size="sm"
                          isLoading={isPurchasing}
                          onPress={() => handleBuyOffer(offer)}
                        />
                      )}
                    </View>
                  </View>
                </Card>
              );
            })
          )}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  header: {
    gap: spacing.xs,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
  loadingContainer: {
    padding: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  itemCard: {
    width: '47%',
    gap: spacing.xs,
    padding: spacing.sm,
    alignItems: 'center',
  },
  itemPreviewBox: {
    width: '100%',
    height: 95,
    backgroundColor: colors.surfaces.surfaceHighlight,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  itemEmoji: {
    fontSize: 44,
  },
  rarityBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  quantityBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: colors.surfaces.surfaceElevated,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  quantityText: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize['2xs'],
    color: colors.text.primary,
    fontWeight: typography.fontWeight.bold,
  },
  itemInfo: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  itemName: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    textAlign: 'center',
  },
  itemDesc: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize['2xs'],
    color: colors.text.secondary,
    textAlign: 'center',
    height: 28,
  },
  actionBtn: {
    width: '100%',
    marginTop: spacing.xs,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xxs,
  },
  coinPriceText: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.xs,
    color: colors.brand.accent,
    fontWeight: typography.fontWeight.bold,
  },
  gemPriceText: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.xs,
    color: colors.rarity.epic,
    fontWeight: typography.fontWeight.bold,
  },
  emptyCard: {
    width: '100%',
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyEmoji: {
    fontSize: 48,
  },
  emptyTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  emptySubtitle: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
});
