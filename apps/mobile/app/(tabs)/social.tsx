import React, { useState } from 'react';
import { Text, TextInput, View, StyleSheet } from 'react-native';
import { Badge, Button, Card, ScreenContainer, colors, radius, spacing, typography, useToast } from '@o2/ui';
import { PublicPlayerSummaryDto } from '@o2/types';
import { useSocial } from '../../src/context/SocialContext';

export default function SocialScreen() {
  const { showToast } = useToast();
  const {
    friends, incomingRequests, outgoingRequests, blockedPlayers, privacy,
    searchPlayers, sendFriendRequest, acceptFriendRequest, rejectFriendRequest,
    cancelFriendRequest, removeFriend, blockPlayer, unblockPlayer, updatePrivacy,
  } = useSocial();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicPlayerSummaryDto[]>([]);

  const search = async () => {
    try { setResults(await searchPlayers(query)); }
    catch (error: any) { showToast({ type: 'error', title: 'تعذر البحث', message: error.message }); }
  };

  return (
    <ScreenContainer scrollable style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>👥 أصدقاء O2</Text>
        <Text style={styles.subtitle}>ابحث باسم المستخدم فقط. لا تظهر أي بيانات حساب خاصة.</Text>
      </View>
      <Card variant="highlight" style={styles.searchCard}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          placeholder="اسم المستخدم (3 أحرف على الأقل)"
          placeholderTextColor={colors.text.tertiary}
          style={styles.input}
        />
        <Button label="بحث" size="sm" onPress={search} disabled={query.trim().length < 3} />
      </Card>
      {results.map((player) => (
        <Card key={player.userId} style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.name}>{player.displayName}</Text>
            <Text style={styles.handle}>@{player.username}</Text>
          </View>
          {player.friendshipState === 'NONE' ? <Button label="إضافة" size="sm" onPress={() => sendFriendRequest(player.userId)} /> : <Badge label={player.friendshipState === 'FRIENDS' ? 'صديق' : 'قيد الانتظار'} variant="primary" size="sm" />}
        </Card>
      ))}
      <Text style={styles.sectionTitle}>طلبات الصداقة</Text>
      {incomingRequests.length === 0 ? <Text style={styles.empty}>لا توجد طلبات معلقة.</Text> : incomingRequests.map((request) => (
        <Card key={request.id} style={styles.requestCard}>
          <Text style={styles.name}>{request.player.displayName}</Text>
          <View style={styles.actions}>
            <Button label="قبول" size="sm" onPress={() => acceptFriendRequest(request.id)} style={styles.flex} />
            <Button label="رفض" size="sm" variant="outline" onPress={() => rejectFriendRequest(request.id)} style={styles.flex} />
          </View>
        </Card>
      ))}
      {outgoingRequests.length > 0 && <Text style={styles.sectionTitle}>الطلبات المرسلة</Text>}
      {outgoingRequests.map((request) => (
        <Card key={request.id} style={styles.row}>
          <View style={styles.rowText}><Text style={styles.name}>{request.player.displayName}</Text><Text style={styles.handle}>بانتظار الرد</Text></View>
          <Button label="إلغاء" size="sm" variant="outline" onPress={() => cancelFriendRequest(request.id)} />
        </Card>
      ))}
      <Text style={styles.sectionTitle}>الأصدقاء ({friends.length})</Text>
      {friends.map((friend) => (
        <Card key={friend.userId} style={styles.row}>
          <View style={styles.rowText}><Text style={styles.name}>{friend.displayName}</Text><Text style={styles.handle}>@{friend.username}</Text></View>
          <Badge label={friend.presence === 'IN_PARTY' ? 'في مجموعة' : friend.presence === 'ACTIVE_RECENTLY' ? 'نشط مؤخرًا' : 'غير نشط'} variant="primary" size="sm" />
          <Button label="إزالة" size="sm" variant="outline" onPress={() => removeFriend(friend.userId)} />
          <Button label="حظر" size="sm" variant="ghost" onPress={() => blockPlayer(friend.userId)} />
        </Card>
      ))}
      <Text style={styles.sectionTitle}>الخصوصية</Text>
      <Card style={styles.requestCard}>
        <Text style={styles.name}>طلبات الصداقة: {privacy?.friendRequestPolicy === 'NOBODY' ? 'مغلقة' : 'للجميع'}</Text>
        <Button label={privacy?.friendRequestPolicy === 'NOBODY' ? 'السماح بالطلبات' : 'إيقاف الطلبات'} size="sm" variant="outline" onPress={() => updatePrivacy({ friendRequestPolicy: privacy?.friendRequestPolicy === 'NOBODY' ? 'EVERYONE' : 'NOBODY' })} />
        <Text style={styles.name}>دعوات المجموعات: {privacy?.allowPartyInvites === false ? 'مغلقة' : 'مفتوحة'}</Text>
        <Button label={privacy?.allowPartyInvites === false ? 'السماح بالدعوات' : 'إيقاف الدعوات'} size="sm" variant="outline" onPress={() => updatePrivacy({ allowPartyInvites: privacy?.allowPartyInvites === false })} />
      </Card>
      {blockedPlayers.length > 0 && <Text style={styles.sectionTitle}>المحظورون</Text>}
      {blockedPlayers.map((player) => (
        <Card key={player.userId} style={styles.row}>
          <View style={styles.rowText}><Text style={styles.name}>{player.displayName}</Text><Text style={styles.handle}>@{player.username}</Text></View>
          <Button label="إلغاء الحظر" size="sm" variant="outline" onPress={() => unblockPlayer(player.userId)} />
        </Card>
      ))}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md }, header: { gap: spacing.xxs },
  title: { color: colors.text.primary, fontFamily: typography.fontFamily.heading, fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold },
  subtitle: { color: colors.text.secondary, fontFamily: typography.fontFamily.body, fontSize: typography.fontSize.sm },
  searchCard: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: { flex: 1, minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.surfaces.borderHighlight, color: colors.text.primary, paddingHorizontal: spacing.md, textAlign: 'right' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md }, rowText: { flex: 1 },
  name: { color: colors.text.primary, fontFamily: typography.fontFamily.heading, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold },
  handle: { color: colors.text.secondary, fontFamily: typography.fontFamily.body, fontSize: typography.fontSize.xs },
  sectionTitle: { color: colors.brand.accent, fontFamily: typography.fontFamily.heading, fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.bold, marginTop: spacing.sm },
  requestCard: { gap: spacing.sm }, actions: { flexDirection: 'row', gap: spacing.sm }, flex: { flex: 1 },
  empty: { color: colors.text.secondary, fontFamily: typography.fontFamily.body, fontSize: typography.fontSize.sm },
});
