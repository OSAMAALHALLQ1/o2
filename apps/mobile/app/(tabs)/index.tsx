import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ScreenContainer,
  Card,
  Button,
  CurrencyBar,
  CompanionRenderer,
  RewardReveal,
  AvatarFrame,
  Badge,
  colors,
  spacing,
  typography,
  radius,
  useToast,
} from '@o2/ui';
import {
  mockParty,
  mockDailyMissions,
} from '../../src/data/mockData';
import { useAuth } from '../../src/context/AuthContext';
import { useCompanion } from '../../src/context/CompanionContext';
import { useEconomy } from '../../src/context/EconomyContext';
import { CompanionCareActionType } from '@o2/types';

export default function HomeScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { companionState, isActing, activeReaction, performAction } = useCompanion();
  const { coins, gems, eventTokens, equippedCosmetics, initializeEconomy } = useEconomy();
  const { showToast } = useToast();
  const [showRewardModal, setShowRewardModal] = useState(false);

  // Auto initialize welcome economy on first profile load
  React.useEffect(() => {
    if (profile?.isOnboarded) {
      initializeEconomy();
    }
  }, [profile, initializeEconomy]);

  const handleAction = async (action: CompanionCareActionType) => {
    try {
      const res = await performAction(action);
      if (res?.success) {
        showToast({
          type: 'success',
          title: '✨ تم بنجاح!',
          message: `تفاعل ${companionState?.nameAr || 'الرفيق'} وسعد باهتمامك!`,
        });
      }
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'تنبيه',
        message: err.message || 'تعذر تطبيق الإجراء في الوقت الحالي',
      });
    }
  };

  const handleCompanionTap = () => {
    handleAction('PET');
  };

  const hunger = Math.round(companionState?.hunger ?? 80);
  const cleanliness = Math.round(companionState?.cleanliness ?? 80);
  const energy = Math.round(companionState?.energy ?? 80);
  const mood = Math.round(companionState?.mood ?? 80);
  const isSleeping = companionState?.isSleeping ?? false;

  return (
    <ScreenContainer scrollable style={styles.container}>
      {/* Header Bar: Profile preview & Currency Bar */}
      <View style={styles.header}>
        <View style={styles.userHeader}>
          <AvatarFrame
            size={42}
            avatarText={profile?.displayName || profile?.username || 'لاعب O2'}
            isOnline
            rarity="EPIC"
          />
          <View style={styles.userInfo}>
            <Text style={styles.displayName}>{profile?.displayName || profile?.username || 'سفير O2'}</Text>
            <Badge label="صالة الأصدقاء 🔥" variant="gold" size="sm" />
          </View>
        </View>

        <CurrencyBar
          coins={coins}
          gems={gems}
          eventTokens={eventTokens?.[0]?.balance}
        />
      </View>

      {/* Main O2 Lounge / Companion Hero Area */}
      <Card variant="elevated" style={styles.heroCard}>
        <View style={styles.loungeHeader}>
          <Text style={styles.loungeTitle}>🏠 صالة O2 الخاصة بك</Text>
          <Badge
            label={isSleeping ? 'نائم 💤' : `الحالة: ${companionState?.expression || 'مبتهج ✨'}`}
            variant={isSleeping ? 'secondary' : 'success'}
            size="sm"
          />
        </View>

        <View style={styles.companionCenter}>
          <CompanionRenderer
            characterSlug={companionState?.characterSlug || 'panda_bamboo_master'}
            expression={companionState?.expression || 'HAPPY'}
            reaction={activeReaction}
            isSleeping={isSleeping}
            equippedCosmetics={{
              headSlug: equippedCosmetics?.HEAD?.item?.slug,
              faceSlug: equippedCosmetics?.FACE?.item?.slug,
              bodySlug: equippedCosmetics?.BODY?.item?.slug,
              backSlug: equippedCosmetics?.BACK?.item?.slug,
              auraSlug: equippedCosmetics?.AURA?.item?.slug,
              nameFrameSlug: equippedCosmetics?.NAME_FRAME?.item?.slug,
            }}
            onTap={handleCompanionTap}
            scale={1.15}
          />
          <Text style={styles.companionName}>
            {companionState?.nameAr || 'باندا بامبو'}
          </Text>
          <Text style={styles.companionArchetype}>
            {companionState?.archetype || 'حارس الغابة'}
          </Text>
        </View>

        {/* Live Needs Quick Meters */}
        <View style={styles.metersRow}>
          <View style={styles.meterItem}>
            <Text style={styles.meterEmoji}>🍗</Text>
            <Text style={styles.meterVal}>{hunger}%</Text>
            <Text style={styles.meterLabel}>شبع</Text>
          </View>
          <View style={styles.meterItem}>
            <Text style={styles.meterEmoji}>🛁</Text>
            <Text style={styles.meterVal}>{cleanliness}%</Text>
            <Text style={styles.meterLabel}>نظافة</Text>
          </View>
          <View style={styles.meterItem}>
            <Text style={styles.meterEmoji}>⚡</Text>
            <Text style={styles.meterVal}>{energy}%</Text>
            <Text style={styles.meterLabel}>طاقة</Text>
          </View>
          <View style={styles.meterItem}>
            <Text style={styles.meterEmoji}>💖</Text>
            <Text style={styles.meterVal}>{mood}%</Text>
            <Text style={styles.meterLabel}>سعادة</Text>
          </View>
        </View>

        {/* Phase 3 Interactive Companion Care Action Bar */}
        <View style={styles.careActionsContainer}>
          <Text style={styles.careActionsTitle}>✨ أنشطة العناية بالرفيق</Text>
          <View style={styles.careButtonsGrid}>
            <TouchableOpacity
              style={[styles.careBtn, isSleeping && styles.careBtnDisabled]}
              disabled={isActing || isSleeping}
              onPress={() => handleAction('FEED')}
              activeOpacity={0.7}
            >
              <Text style={styles.careBtnEmoji}>🍗</Text>
              <Text style={styles.careBtnLabel}>إطعام</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.careBtn, isSleeping && styles.careBtnDisabled]}
              disabled={isActing || isSleeping}
              onPress={() => handleAction('CLEAN')}
              activeOpacity={0.7}
            >
              <Text style={styles.careBtnEmoji}>🛁</Text>
              <Text style={styles.careBtnLabel}>تنظيف</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.careBtn, (isSleeping || energy < 15) && styles.careBtnDisabled]}
              disabled={isActing || isSleeping || energy < 15}
              onPress={() => handleAction('PLAY')}
              activeOpacity={0.7}
            >
              <Text style={styles.careBtnEmoji}>🎮</Text>
              <Text style={styles.careBtnLabel}>لعب</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.careBtn, isSleeping && styles.careBtnDisabled]}
              disabled={isActing || isSleeping}
              onPress={() => handleAction('PET')}
              activeOpacity={0.7}
            >
              <Text style={styles.careBtnEmoji}>💖</Text>
              <Text style={styles.careBtnLabel}>مداعبة</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.careBtn, isSleeping ? styles.careBtnWake : styles.careBtnSleep]}
              disabled={isActing}
              onPress={() => handleAction(isSleeping ? 'WAKE' : 'SLEEP')}
              activeOpacity={0.7}
            >
              <Text style={styles.careBtnEmoji}>{isSleeping ? '☀️' : '🌙'}</Text>
              <Text style={styles.careBtnLabel}>{isSleeping ? 'إيقاظ' : 'نوم'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Card>

      {/* Party Presence Lounge */}
      <Card variant="highlight" style={styles.partyCard}>
        <View style={styles.partyHeader}>
          <Text style={styles.sectionTitle}>👥 الفريق الحالي ({mockParty.roomCode})</Text>
          <Badge label="3/8 لاعبين" variant="secondary" size="sm" />
        </View>
        <View style={styles.partyMembersRow}>
          {mockParty.members.map((member) => (
            <View key={member.userId} style={styles.partyMemberCol}>
              <AvatarFrame
                size={48}
                avatarText={member.displayName}
                rarity={member.isLeader ? 'LEGENDARY' : 'RARE'}
                isOnline
              />
              <Text style={styles.partyMemberName} numberOfLines={1}>
                {member.displayName}
              </Text>
            </View>
          ))}
          <View style={styles.addMemberPlaceholder}>
            <Text style={styles.addMemberPlus}>➕</Text>
            <Text style={styles.addMemberText}>دعوة</Text>
          </View>
        </View>
      </Card>

      {/* Quick CTAs */}
      <View style={styles.ctaRow}>
        <Button
          label="العب الآن 🎮"
          variant="primary"
          size="lg"
          onPress={() => router.push('/play')}
          style={styles.ctaBtn}
        />
        <Button
          label="اطلب من المطعم 🍔"
          variant="gold"
          size="lg"
          onPress={() => router.push('/order')}
          style={styles.ctaBtn}
        />
      </View>

      {/* Daily Missions Area */}
      <Card style={styles.missionsCard}>
        <View style={styles.missionsHeader}>
          <Text style={styles.sectionTitle}>🎯 المهام اليومية</Text>
          <Text style={styles.missionsSubtitle}>تتجدد كل 24 ساعة</Text>
        </View>

        <View style={styles.missionsList}>
          {mockDailyMissions.map((mission) => (
            <View key={mission.id} style={styles.missionRow}>
              <View style={styles.missionDetails}>
                <Text style={styles.missionTitle}>{mission.title}</Text>
                <Text style={styles.missionReward}>+{mission.rewardCoins} عملة 🪙</Text>
              </View>
              <Badge
                label={mission.isClaimed ? 'مكتملة ✅' : `${mission.progress}/${mission.target}`}
                variant={mission.isClaimed ? 'success' : 'secondary'}
                size="sm"
              />
            </View>
          ))}
        </View>
      </Card>

      {/* Reward Drop Teaser */}
      <Card
        variant="goldBorder"
        onPress={() => setShowRewardModal(true)}
        style={styles.rewardCard}
      >
        <Text style={styles.rewardBoxIcon}>🎁</Text>
        <View style={styles.rewardInfo}>
          <Text style={styles.rewardCardTitle}>صندوق مكافأة متاح!</Text>
          <Text style={styles.rewardCardDesc}>
            حصلت على مكافأة جديدة بفضل نشاطك اليوم. اضغط للمعاينة.
          </Text>
        </View>
      </Card>

      {/* Reward Reveal Shell Modal */}
      <RewardReveal
        visible={showRewardModal}
        onClose={() => setShowRewardModal(false)}
        tier="LEGENDARY"
        rewardTitle="تاج O2 الذهبي الفاخر"
        rewardSubtitle="عنصر أزياء أسطوري يظهر في صالة الأصدقاء ومباريات الألعاب"
        rewardIcon="👑"
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  userInfo: {
    gap: 2,
  },
  displayName: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  heroCard: {
    alignItems: 'center',
    gap: spacing.md,
  },
  loungeHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  loungeTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  companionCenter: {
    alignItems: 'center',
    gap: spacing.xs,
    marginVertical: spacing.xs,
  },
  companionName: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.brand.accent,
  },
  companionArchetype: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  metersRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
    backgroundColor: colors.surfaces.surfaceHighlight,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  meterItem: {
    alignItems: 'center',
    gap: 2,
  },
  meterEmoji: {
    fontSize: 18,
  },
  meterVal: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  meterLabel: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize['2xs'],
    color: colors.text.secondary,
  },
  careActionsContainer: {
    width: '100%',
    gap: spacing.xs + 2,
    marginTop: spacing.xs,
  },
  careActionsTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.secondary,
  },
  careButtonsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: spacing.xs,
  },
  careBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaces.surfaceElevated,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surfaces.borderHighlight,
    gap: 3,
  },
  careBtnSleep: {
    borderColor: colors.rarity.epic,
  },
  careBtnWake: {
    borderColor: colors.brand.accent,
    backgroundColor: '#231d3d',
  },
  careBtnDisabled: {
    opacity: 0.4,
  },
  careBtnEmoji: {
    fontSize: 20,
  },
  careBtnLabel: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize['2xs'],
    color: colors.text.primary,
    fontWeight: typography.fontWeight.bold,
  },
  partyCard: {
    gap: spacing.md,
  },
  partyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  partyMembersRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  partyMemberCol: {
    alignItems: 'center',
    gap: spacing.xs,
    width: 60,
  },
  partyMemberName: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize['2xs'],
    color: colors.text.secondary,
    textAlign: 'center',
  },
  addMemberPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.surfaces.borderHighlight,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addMemberPlus: {
    fontSize: 16,
  },
  addMemberText: {
    fontSize: 9,
    color: colors.text.secondary,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  ctaBtn: {
    flex: 1,
  },
  missionsCard: {
    gap: spacing.md,
  },
  missionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  missionsSubtitle: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
  },
  missionsList: {
    gap: spacing.sm,
  },
  missionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderColor: colors.surfaces.border,
  },
  missionDetails: {
    gap: 2,
  },
  missionTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
  },
  missionReward: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize['2xs'],
    color: colors.brand.accent,
  },
  rewardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  rewardBoxIcon: {
    fontSize: 36,
  },
  rewardInfo: {
    flex: 1,
    gap: 2,
  },
  rewardCardTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.brand.accent,
  },
  rewardCardDesc: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
});
