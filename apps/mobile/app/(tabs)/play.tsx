import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
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
import { PartyGameMode } from '@o2/types';
import { useAuth } from '../../src/context/AuthContext';
import { useSocial } from '../../src/context/SocialContext';

export default function PlayScreen() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const {
    party, partyInvites, friends, createParty, acceptPartyInvite, rejectPartyInvite,
    inviteFriend, leaveParty, kickMember, setReady, selectGame,
    setCodeAccess, joinByCode, isLoading,
  } = useSocial();
  const [partyCode, setPartyCode] = useState('');

  const modeForSlug = (slug: string): PartyGameMode | null => ({
    atrash: 'ATRASH', mafia: 'MAFIA_CLASSIC', tarneeb: 'TARNEEB',
    hide_seek: 'HIDE_AND_SEEK', imposter_sabotage: 'O2_IMPOSTER',
  } as Record<string, PartyGameMode>)[slug] ?? null;

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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>👥 مجموعة O2 الخاصة بك</Text>
        {!party ? (
          <Card variant="highlight" style={styles.partyEmpty}>
            <Text style={styles.partyTitle}>اجمع أصدقاءك قبل اختيار اللعبة</Text>
            <Text style={styles.partyHint}>الحالة محفوظة على الخادم. لا يوجد تشغيل مباراة في Phase 5.</Text>
            <Button label="إنشاء مجموعة" onPress={createParty} isLoading={isLoading} />
          </Card>
        ) : (
          <Card variant="goldBorder" style={styles.partyCard}>
            <View style={styles.partyHeader}>
              <View><Text style={styles.partyTitle}>رمز المجموعة: {party.roomCode}</Text><Text style={styles.partyHint}>الإصدار {party.version} · {party.members.length}/{party.capacity}</Text></View>
              <Badge label={party.desiredGameMode ?? 'بدون لعبة'} variant="gold" size="sm" />
            </View>
            {party.members.map((member) => (
              <View key={member.userId} style={styles.memberRow}>
                <Text style={styles.memberAvatar}>🐼</Text>
                <View style={styles.memberInfo}><Text style={styles.memberName}>{member.displayName}</Text><Text style={styles.partyHint}>@{member.username}</Text></View>
                {member.isLeader && <Badge label="القائد" variant="gold" size="sm" />}
                <Badge label={member.isReady ? 'جاهز' : 'غير جاهز'} variant={member.isReady ? 'primary' : 'secondary'} size="sm" />
                {party.leaderId === user?.id && !member.isLeader && <Button label="إخراج" variant="ghost" size="sm" onPress={() => kickMember(member.userId)} />}
              </View>
            ))}
            <View style={styles.partyActions}>
              <Button label="جاهز" size="sm" onPress={() => setReady('READY')} style={styles.flex} />
              <Button label="غير جاهز" variant="secondary" size="sm" onPress={() => setReady('NOT_READY')} style={styles.flex} />
              <Button label="مغادرة" variant="outline" size="sm" onPress={leaveParty} style={styles.flex} />
            </View>
            {party.leaderId === user?.id && (
              <Button
                label={party.allowJoinByCode ? 'إغلاق الدخول بالكود' : 'فتح الدخول بالكود'}
                variant="outline"
                size="sm"
                onPress={() => setCodeAccess(!party.allowJoinByCode)}
              />
            )}
            {party.leaderId === user?.id && friends.filter((friend) => !party.members.some((member) => member.userId === friend.userId)).slice(0, 3).map((friend) => (
              <View key={friend.userId} style={styles.inviteRow}><Text style={styles.memberName}>{friend.displayName}</Text><Button label="دعوة" size="sm" onPress={() => inviteFriend(friend.userId)} /></View>
            ))}
          </Card>
        )}
        {partyInvites.map((invite) => (
          <Card key={invite.id} style={styles.inviteCard}>
            <Text style={styles.memberName}>دعوة من {invite.inviter.displayName}</Text>
            <View style={styles.partyActions}><Button label="انضمام" size="sm" onPress={() => acceptPartyInvite(invite.id)} style={styles.flex} /><Button label="رفض" size="sm" variant="outline" onPress={() => rejectPartyInvite(invite.id)} style={styles.flex} /></View>
          </Card>
        ))}
        {!party && (
          <Card style={styles.codeJoinCard}>
            <Text style={styles.partyTitle}>الانضمام بكود خاص</Text>
            <Text style={styles.partyHint}>يعمل فقط إذا فعّل قائد المجموعة الدخول بالكود.</Text>
            <View style={styles.codeJoinRow}>
              <TextInput
                value={partyCode}
                onChangeText={(value) => setPartyCode(value.toUpperCase())}
                autoCapitalize="characters"
                maxLength={6}
                placeholder="ABC234"
                placeholderTextColor={colors.text.tertiary}
                style={styles.codeInput}
              />
              <Button label="انضمام" size="sm" disabled={partyCode.length !== 6} onPress={() => joinByCode(partyCode)} />
            </View>
          </Card>
        )}
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
            onPress={() => {
              const mode = modeForSlug(game.slug);
              if (party && party.leaderId === user?.id && mode) void selectGame(mode);
              else handleGameSelect(game.nameKey);
            }}
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
                onPress={() => {
                  const mode = modeForSlug(game.slug);
                  if (party && party.leaderId === user?.id && mode) void selectGame(mode);
                  else handleGameSelect(game.nameKey);
                }}
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
  section: { gap: spacing.sm },
  sectionTitle: { fontFamily: typography.fontFamily.heading, fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.bold, color: colors.text.primary },
  partyEmpty: { gap: spacing.md },
  partyCard: { gap: spacing.md },
  partyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  partyTitle: { fontFamily: typography.fontFamily.heading, fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.bold, color: colors.text.primary },
  partyHint: { fontFamily: typography.fontFamily.body, fontSize: typography.fontSize.xs, color: colors.text.secondary },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  memberAvatar: { fontSize: 26 }, memberInfo: { flex: 1 },
  memberName: { fontFamily: typography.fontFamily.heading, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold, color: colors.text.primary },
  partyActions: { flexDirection: 'row', gap: spacing.sm }, flex: { flex: 1 },
  inviteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  inviteCard: { gap: spacing.sm },
  codeJoinCard: { gap: spacing.sm },
  codeJoinRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  codeInput: { flex: 1, minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.surfaces.borderHighlight, color: colors.text.primary, paddingHorizontal: spacing.md, letterSpacing: 4, textAlign: 'center' },
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
