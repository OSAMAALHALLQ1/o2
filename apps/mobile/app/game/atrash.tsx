import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
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
import { useAuth } from '../../src/context/AuthContext';
import { useMatchmaking } from '../../src/context/MatchmakingContext';
import { useAtrashGame } from '../../src/context/AtrashGameContext';

export default function AtrashGameScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { match, clearMatch } = useMatchmaking();
  const {
    roomId,
    publicState,
    playerState,
    isLoading,
    isConnected,
    isResyncing,
    timeRemainingSeconds,
    joinAtrashRoom,
    startGame,
    submitQuestion,
    submitAnswer,
    castVote,
    submitLastChance,
    advancePhase,
    leaveRoom,
  } = useAtrashGame();

  const [questionInput, setQuestionInput] = useState('');
  const [answerInput, setAnswerInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRoleRevealed, setIsRoleRevealed] = useState(false);

  // Initialize room from match assignment or active room
  useEffect(() => {
    if (match?.roomId && match.roomId !== roomId) {
      void joinAtrashRoom(match.roomId);
    }
  }, [match, roomId, joinAtrashRoom]);

  const handleLeave = async () => {
    try {
      await leaveRoom();
      clearMatch();
      router.replace('/(tabs)/play' as any);
    } catch {
      router.replace('/(tabs)/play' as any);
    }
  };

  const handleSendQuestion = async () => {
    if (!questionInput.trim()) return;
    setIsSubmitting(true);
    try {
      await submitQuestion(questionInput.trim());
      setQuestionInput('');
      showToast({ type: 'success', title: 'تم طرح السؤال', message: 'بانتظار إجابة اللاعب...' });
    } catch (err: any) {
      showToast({ type: 'error', title: 'تعذر طرح السؤال', message: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendAnswer = async () => {
    if (!answerInput.trim()) return;
    setIsSubmitting(true);
    try {
      await submitAnswer(answerInput.trim());
      setAnswerInput('');
      showToast({ type: 'success', title: 'تم إرسال الإجابة', message: 'شكراً لإجابتك' });
    } catch (err: any) {
      showToast({ type: 'error', title: 'تعذر إرسال الإجابة', message: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVote = async (targetUserId: string) => {
    setIsSubmitting(true);
    try {
      await castVote(targetUserId);
      showToast({ type: 'info', title: '🤫 تم تسجيل صوتك', message: 'الصوت سري تماماً حتى نهاية التصويت' });
    } catch (err: any) {
      showToast({ type: 'error', title: 'خطأ في التصويت', message: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLastChanceSelect = async (word: string) => {
    setIsSubmitting(true);
    try {
      await submitLastChance(word);
    } catch (err: any) {
      showToast({ type: 'error', title: 'خطأ', message: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading / Connection state
  if (isLoading && !publicState) {
    return (
      <ScreenContainer style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.brand.primary} />
        <Text style={styles.loadingText}>جاري الاتصال بغرفة الزفة...</Text>
      </ScreenContainer>
    );
  }

  const phase = publicState?.phase ?? 'LOBBY';
  const participants = publicState?.participants ?? [];
  const currentTurn = publicState?.turn;
  const isMyTurnToAsk = playerState?.myTurnRole === 'ASKER' && currentTurn?.stage === 'ASKING';
  const isMyTurnToAnswer = playerState?.myTurnRole === 'ANSWERER' && currentTurn?.stage === 'ANSWERING';

  return (
    <ScreenContainer style={styles.container}>
      {/* Reconnect / Grace Banner */}
      {(!isConnected || isResyncing) && (
        <View style={styles.reconnectBanner}>
          <Text style={styles.reconnectText}>⚡ جاري إعادة المزامنة مع الخادم...</Text>
        </View>
      )}

      {/* Top Game Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
          <Text style={styles.leaveBtnText}>خروج</Text>
        </TouchableOpacity>

        <View style={styles.roundInfo}>
          <Text style={styles.roundTitle}>
            أطرش بالزفة · الجولة {publicState?.roundNumber ?? 1}
          </Text>
          {publicState?.category && (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryIcon}>{publicState.category.icon}</Text>
              <Text style={styles.categoryName}>{publicState.category.nameAr}</Text>
            </View>
          )}
        </View>

        {timeRemainingSeconds > 0 && (
          <View style={styles.timerBox}>
            <Text style={styles.timerNumber}>{timeRemainingSeconds}s</Text>
          </View>
        )}
      </View>

      {/* 5-Player Restaurant Seating Table */}
      <View style={styles.tableArea}>
        <View style={styles.tableCenter}>
          <Text style={styles.tableLogo}>🍽️ O2 طاولة</Text>
          <Text style={styles.phaseStatusText}>
            {phase === 'LOBBY' && 'بانتظار بدء الجولة...'}
            {phase === 'QUESTION_PHASE' && 'مرحلة الأسئلة والأجوبة'}
            {phase === 'DISCUSSION_PHASE' && 'نقاش وتفكير جماعي 💬'}
            {phase === 'VOTING' && 'تصويت سري لاكتشاف الأطرش 🕵️'}
            {phase === 'VOTE_REVEAL' && 'كشف نتائج التصويت!'}
            {phase === 'ATRASH_LAST_CHANCE' && 'الفرصة الأخيرة للأطرش! 🎯'}
            {phase === 'ROUND_RESULT' && 'نتائج الجولة والدرجات 🏆'}
            {phase === 'MATCH_RESULT' && '🎉 انتهاء المباراة وتتويج الفائز!'}
          </Text>
        </View>

        {/* 5 Player Seats */}
        <View style={styles.seatsRow}>
          {participants.map((p) => {
            const isSelf = p.userId === user?.id;
            const score = publicState?.scores[p.userId] ?? 0;
            const isAsker = currentTurn?.askerUserId === p.userId && currentTurn.stage === 'ASKING';
            const isAnswerer = currentTurn?.answererUserId === p.userId && currentTurn.stage === 'ANSWERING';
            const hasVoted = publicState?.votedUserIds.includes(p.userId);

            return (
              <View key={p.userId} style={[styles.seatCard, isSelf && styles.selfSeatCard]}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarEmoji}>{isSelf ? '😎' : '🧸'}</Text>
                  {!p.isConnected && (
                    <View style={styles.offlineDot} />
                  )}
                </View>
                <Text style={styles.playerName} numberOfLines={1}>
                  {p.displayName ?? p.username}
                </Text>
                <Text style={styles.playerScore}>{score} نقطة</Text>
                {isAsker && <Badge label="يسأل ❓" variant="primary" size="sm" />}
                {isAnswerer && <Badge label="يجيب 💡" variant="gold" size="sm" />}
                {phase === 'VOTING' && hasVoted && (
                  <Badge label="صوّت ✅" variant="primary" size="sm" />
                )}
              </View>
            );
          })}
        </View>
      </View>

      {/* Main Dynamic Stage Card */}
      <ScrollView style={styles.contentScroll} contentContainerStyle={styles.contentInner}>

        {/* Phase 1 & 2: LOBBY & STARTING */}
        {phase === 'LOBBY' && (
          <Card variant="elevated" style={styles.stageCard}>
            <Text style={styles.stageTitle}>جاهزية الجولة</Text>
            <Text style={styles.stageDesc}>
              اكتمل 5 لاعبين على طاولة O2. اضغط على الزر أدناه لبدء توزيع الأدوار وبدء التحدي!
            </Text>
            <Button
              label="بدء المباراة الآن"
              variant="primary"
              size="md"
              onPress={() => void startGame()}
            />
          </Card>
        )}

        {/* Phase 3: QUESTION_PHASE */}
        {phase === 'QUESTION_PHASE' && (
          <Card variant="elevated" style={styles.stageCard}>
            <View style={styles.turnStatusBox}>
              <Text style={styles.turnTitle}>
                الدور {((currentTurn?.currentTurnIndex ?? 0) + 1)} من 5
              </Text>
              {currentTurn?.stage === 'ASKING' ? (
                <Text style={styles.turnSubtitle}>
                  اللاعب <Text style={styles.highlightName}>{participants.find(p => p.userId === currentTurn.askerUserId)?.displayName ?? 'السائل'}</Text> يطرح سؤالاً غير مباشر...
                </Text>
              ) : (
                <Text style={styles.turnSubtitle}>
                  اللاعب <Text style={styles.highlightName}>{participants.find(p => p.userId === currentTurn?.answererUserId)?.displayName ?? 'المجيب'}</Text> يجيب على السؤال...
                </Text>
              )}
            </View>

            {/* If Current Turn is Asker */}
            {isMyTurnToAsk && (
              <View style={styles.inputSection}>
                <Text style={styles.inputLabel}>دورك لطرح السؤال (اسأل بذكاء دون فضح الكلمة):</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="مثال: هل يرتبط هذا الشيء بالصباح عادة؟"
                  placeholderTextColor={colors.text.tertiary}
                  value={questionInput}
                  onChangeText={setQuestionInput}
                  maxLength={120}
                  textAlign="right"
                />
                <Button
                  label="إرسال السؤال"
                  variant="primary"
                  size="md"
                  isLoading={isSubmitting}
                  disabled={!questionInput.trim()}
                  onPress={handleSendQuestion}
                />
              </View>
            )}

            {/* If Current Turn is Answerer */}
            {isMyTurnToAnswer && (
              <View style={styles.inputSection}>
                <Text style={styles.currentQuestionBubble}>
                  ❓ السؤال الموجه لك: "{currentTurn?.questionText}"
                </Text>
                <Text style={styles.inputLabel}>دورك للإجابة (أجب بحذر):</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="مثال: نعم، في الغالب وبشكل متكرر"
                  placeholderTextColor={colors.text.tertiary}
                  value={answerInput}
                  onChangeText={setAnswerInput}
                  maxLength={120}
                  textAlign="right"
                />
                <Button
                  label="إرسال الإجابة"
                  variant="primary"
                  size="md"
                  isLoading={isSubmitting}
                  disabled={!answerInput.trim()}
                  onPress={handleSendAnswer}
                />
              </View>
            )}

            {/* Previous Q&A Stream */}
            {publicState?.dialogueHistory && publicState.dialogueHistory.length > 0 && (
              <View style={styles.historyContainer}>
                <Text style={styles.historyHeader}>سجل الحوارات في هذه الجولة:</Text>
                {publicState.dialogueHistory.map((item, idx) => {
                  const asker = participants.find((p) => p.userId === item.askerUserId)?.displayName ?? 'لاعب';
                  const answerer = participants.find((p) => p.userId === item.answererUserId)?.displayName ?? 'لاعب';
                  return (
                    <View key={idx} style={styles.dialogueBubble}>
                      <Text style={styles.qText}>
                        <Text style={styles.boldText}>{asker}</Text>: {item.questionText}
                      </Text>
                      <Text style={styles.aText}>
                        <Text style={styles.boldText}>{answerer}</Text>: {item.answerText}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </Card>
        )}

        {/* Phase 4: DISCUSSION_PHASE */}
        {phase === 'DISCUSSION_PHASE' && (
          <Card variant="elevated" style={styles.stageCard}>
            <Text style={styles.stageTitle}>مرحلة النقاش المفتوح 🗣️</Text>
            <Text style={styles.stageDesc}>
              حللوا الإجابات السابقة! من بدا مرتبكاً أو يفتقر للمعلومات؟ ناقشوا بهدوء قبل بدء التصويت السري.
            </Text>
            <View style={styles.discussionTimerNotice}>
              <Text style={styles.discussionNoticeText}>
                ينتهي النقاش ويبدأ التصويت تلقائياً بعد: {timeRemainingSeconds} ثانية
              </Text>
            </View>
            <Button
              label="بدء التصويت الآن 🗳️"
              variant="secondary"
              size="md"
              onPress={() => void advancePhase()}
            />
          </Card>
        )}

        {/* Phase 5: VOTING */}
        {phase === 'VOTING' && (
          <Card variant="elevated" style={styles.stageCard}>
            <Text style={styles.stageTitle}>التصويت السري 🕵️</Text>
            <Text style={styles.stageDesc}>
              من هو الأطرش برأيك؟ اختر لاعباً واحداً تشك فيه. تصويتك سري بالكامل.
            </Text>

            {playerState?.hasVoted ? (
              <View style={styles.votedNoticeBox}>
                <Text style={styles.votedNoticeTitle}>✅ تم تسجيل تصويتك بنجاح</Text>
                <Text style={styles.votedNoticeDesc}>
                  بانتظار بقية اللاعبين لاكتمال الفرز أو انتهاء وقت التصويت ({timeRemainingSeconds}s).
                </Text>
              </View>
            ) : (
              <View style={styles.votingGrid}>
                {participants
                  .filter((p) => p.userId !== user?.id)
                  .map((p) => (
                    <TouchableOpacity
                      key={p.userId}
                      style={styles.voteTargetCard}
                      onPress={() => handleVote(p.userId)}
                    >
                      <Text style={styles.voteAvatarEmoji}>👤</Text>
                      <Text style={styles.voteTargetName}>{p.displayName ?? p.username}</Text>
                      <Badge label="صوّت ضده" variant="secondary" size="sm" />
                    </TouchableOpacity>
                  ))}
              </View>
            )}
          </Card>
        )}

        {/* Phase 6: VOTE_REVEAL */}
        {phase === 'VOTE_REVEAL' && publicState?.voteReveal && (
          <Card variant="elevated" style={styles.stageCard}>
            <Text style={styles.stageTitle}>نتائج التصويت 🗳️</Text>
            {publicState.voteReveal.isTie ? (
              <View style={styles.tieBox}>
                <Text style={styles.tieTitle}>⚖️ تعادل في الأصوات!</Text>
                <Text style={styles.tieDesc}>
                  تعادل كل من:{' '}
                  {publicState.voteReveal.tiedUserIds
                    .map((id) => participants.find((p) => p.userId === id)?.displayName ?? id)
                    .join(' و ')}
                </Text>
                <Text style={styles.tieSub}>
                  {publicState.voteReveal.isRevote
                    ? 'التعادل مستمر في الإعادة! الأطرش ينجو ويفوز بنقاط الجولة! 👰✨'
                    : 'سيتم الانتقال إلى جولة تصويت فاصلة وحاسمة...'}
                </Text>
              </View>
            ) : (
              <View style={styles.accusedBox}>
                <Text style={styles.accusedTitle}>
                  أعلى الأصوات: {participants.find((p) => p.userId === publicState.voteReveal?.highestVotedUserId)?.displayName ?? 'اللاعب'}
                </Text>
                <Text style={styles.accusedStatus}>
                  {publicState.voteReveal.atrashDetected
                    ? '🎯 أصاب اللاعبون! تم كشف الأطرش بالزفة!'
                    : '❌ أخطأ اللاعبون! لم يكن هذا هو الأطرش!'}
                </Text>
              </View>
            )}
          </Card>
        )}

        {/* Phase 7: ATRASH_LAST_CHANCE */}
        {phase === 'ATRASH_LAST_CHANCE' && (
          <Card variant="elevated" style={styles.stageCard}>
            <Text style={styles.stageTitle}>الفرصة الأخيرة للأطرش 🎯</Text>
            {playerState?.isAtrash ? (
              <View style={styles.lastChanceAtrashBox}>
                <Text style={styles.lastChanceTitle}>
                  لقد تم كشفك! ولكن لديك فرصة أخيرة لكسب نقطة إضافية:
                </Text>
                <Text style={styles.lastChanceSub}>
                  خمّن ما هي الكلمة السرية الصحيحة من بين الخيارات التالية:
                </Text>
                <View style={styles.optionsGrid}>
                  {(publicState?.lastChance?.options ?? playerState?.lastChanceOptions ?? []).map((opt, i) => (
                    <TouchableOpacity
                      key={i}
                      style={styles.optionBtn}
                      onPress={() => handleLastChanceSelect(opt)}
                    >
                      <Text style={styles.optionBtnText}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.lastChanceSpectatorBox}>
                <Text style={styles.spectatorText}>
                  الأطرش يحاول الآن تخمين الكلمة السرية من بين 4 خيارات...
                </Text>
                <ActivityIndicator size="small" color={colors.brand.primary} />
              </View>
            )}
          </Card>
        )}

        {/* Phase 8: ROUND_RESULT */}
        {phase === 'ROUND_RESULT' && publicState?.roundResult && (
          <Card variant="elevated" style={styles.stageCard}>
            <Text style={styles.stageTitle}>ملخص الجولة {publicState.roundResult.roundNumber} 📊</Text>
            <View style={styles.resultDetailsBox}>
              <Text style={styles.secretWordNotice}>
                الكلمة السرية كانت:{' '}
                <Text style={styles.secretWordHighlight}>
                  {publicState.roundResult.secretWord}
                </Text>
              </Text>
              <Text style={styles.atrashIdentityNotice}>
                الأطرش كان:{' '}
                <Text style={styles.atrashNameHighlight}>
                  {participants.find((p) => p.userId === publicState.roundResult?.atrashUserId)?.displayName ?? 'الأطرش'}
                </Text>
              </Text>
              <Text style={styles.pointsNotice}>
                {publicState.roundResult.atrashDetected
                  ? 'تم كشف الأطرش (+1 لكل من صوّت له بدقة)'
                  : 'نجا الأطرش دون كشفه (+2 للأطرش)'}
              </Text>
              {publicState.roundResult.lastChanceAttempted && (
                <Text style={styles.lastChanceOutcome}>
                  فرصة الأطرش الأخيرة:{' '}
                  {publicState.roundResult.lastChanceSuccess
                    ? 'نجح في التخمين! (+1 للأطرش) 🎉'
                    : 'أخطأ في التخمين ❌'}
                </Text>
              )}
            </View>

            <Button
              label="بدء الجولة التالية ⏭️"
              variant="primary"
              size="md"
              onPress={() => void advancePhase()}
            />
          </Card>
        )}

        {/* Phase 9: MATCH_RESULT */}
        {phase === 'MATCH_RESULT' && publicState?.matchResult && (
          <Card variant="highlight" style={styles.stageCard}>
            <Text style={styles.victoryEmoji}>🏆</Text>
            <Text style={styles.victoryTitle}>مبروك لبطل الزفة!</Text>
            <Text style={styles.winnerName}>{publicState.matchResult.winnerUsername}</Text>
            <Text style={styles.victoryDesc}>
              أول لاعب وصل إلى 5 نقاط في السباق وحسم الفوز في عالم O2!
            </Text>
            <Button
              label="العودة إلى صالة الألعاب"
              variant="primary"
              size="md"
              onPress={handleLeave}
            />
          </Card>
        )}

      </ScrollView>

      {/* Floating Private Role Reveal Peek Card */}
      <View style={styles.rolePeekBar}>
        <TouchableOpacity
          style={styles.rolePeekCard}
          onPress={() => setIsRoleRevealed((prev) => !prev)}
        >
          <View style={styles.rolePeekHeader}>
            <Text style={styles.rolePeekEye}>{isRoleRevealed ? '👁️' : '🙈'}</Text>
            <Text style={styles.rolePeekTitle}>
              {isRoleRevealed ? 'بطاقة دورك السري (اضغط للإخفاء)' : 'انقر لكشف بطاقتك وسرك'}
            </Text>
          </View>
          {isRoleRevealed && (
            <View style={styles.roleSecretBox}>
              {playerState?.isAtrash ? (
                <View style={styles.atrashRoleBanner}>
                  <Text style={styles.atrashBannerTitle}>أنت الأطرش بالزفة! 👰🤫</Text>
                  <Text style={styles.atrashBannerHint}>
                    أنت الوحيد الذي لا يعرف الكلمة! تعرف فقط التصنيف ({playerState.category?.nameAr}).
                    تظاهر بالمعرفة واطرح أسئلة ذكية لا تكشفك!
                  </Text>
                </View>
              ) : (
                <View style={styles.informedRoleBanner}>
                  <Text style={styles.informedBannerTitle}>أنت تعرف السر! 💡</Text>
                  <Text style={styles.informedWordText}>الكلمة: {playerState?.secretWord}</Text>
                  <Text style={styles.informedBannerHint}>
                    التصنيف: {playerState?.category?.nameAr}. اسأل وأجب بحذر واكتشف الأطرش.
                  </Text>
                </View>
              )}
            </View>
          )}
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.md,
    backgroundColor: colors.surfaces.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  reconnectBanner: {
    backgroundColor: colors.brand.primary,
    padding: spacing.xs,
    borderRadius: radius.sm,
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  reconnectText: {
    fontFamily: typography.fontFamily.body,
    color: colors.surfaces.surface,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  leaveBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaces.surfaceHighlight,
  },
  leaveBtnText: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  roundInfo: {
    alignItems: 'center',
  },
  roundTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  categoryIcon: {
    fontSize: 14,
  },
  categoryName: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    color: colors.brand.accent,
  },
  timerBox: {
    minWidth: 40,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  timerNumber: {
    fontFamily: typography.fontFamily.heading,
    color: colors.surfaces.surface,
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.xs,
  },
  tableArea: {
    backgroundColor: colors.surfaces.surface,
    borderRadius: radius.lg,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaces.surfaceHighlight,
  },
  tableCenter: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  tableLogo: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.brand.accent,
  },
  phaseStatusText: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    marginTop: 2,
  },
  seatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xxs,
  },
  seatCard: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.xxs,
    backgroundColor: colors.surfaces.surfaceHighlight,
    borderRadius: radius.md,
  },
  selfSeatCard: {
    borderColor: colors.brand.primary,
    borderWidth: 1,
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: colors.surfaces.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  avatarEmoji: {
    fontSize: 20,
  },
  offlineDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.semantic.error,
  },
  playerName: {
    fontFamily: typography.fontFamily.body,
    fontSize: 10,
    color: colors.text.primary,
    fontWeight: typography.fontWeight.bold,
  },
  playerScore: {
    fontFamily: typography.fontFamily.body,
    fontSize: 9,
    color: colors.text.tertiary,
    marginBottom: 2,
  },
  contentScroll: {
    flex: 1,
  },
  contentInner: {
    paddingBottom: 80,
  },
  stageCard: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  stageTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    textAlign: 'center',
  },
  stageDesc: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  turnStatusBox: {
    alignItems: 'center',
    gap: 2,
  },
  turnTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.brand.primary,
  },
  turnSubtitle: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  highlightName: {
    color: colors.text.primary,
    fontWeight: typography.fontWeight.bold,
  },
  inputSection: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  inputLabel: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  currentQuestionBubble: {
    backgroundColor: colors.surfaces.surfaceHighlight,
    padding: spacing.sm,
    borderRadius: radius.md,
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.sm,
    color: colors.brand.accent,
  },
  textInput: {
    backgroundColor: colors.surfaces.background,
    borderColor: colors.surfaces.surfaceHighlight,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
  },
  historyContainer: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.surfaces.surfaceHighlight,
    paddingTop: spacing.xs,
    gap: spacing.xs,
  },
  historyHeader: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
  },
  dialogueBubble: {
    backgroundColor: colors.surfaces.background,
    padding: spacing.xs,
    borderRadius: radius.sm,
    gap: 2,
  },
  qText: {
    fontFamily: typography.fontFamily.body,
    fontSize: 11,
    color: colors.text.primary,
  },
  aText: {
    fontFamily: typography.fontFamily.body,
    fontSize: 11,
    color: colors.text.secondary,
  },
  boldText: {
    fontWeight: typography.fontWeight.bold,
    color: colors.brand.primary,
  },
  discussionTimerNotice: {
    backgroundColor: colors.surfaces.surfaceHighlight,
    padding: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  discussionNoticeText: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    color: colors.brand.accent,
  },
  votingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  voteTargetCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.surfaces.surfaceHighlight,
    padding: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    gap: spacing.xxs,
  },
  voteAvatarEmoji: {
    fontSize: 24,
  },
  voteTargetName: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
    fontWeight: typography.fontWeight.bold,
  },
  votedNoticeBox: {
    backgroundColor: colors.surfaces.surfaceHighlight,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  votedNoticeTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.semantic.success,
  },
  votedNoticeDesc: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  accusedBox: {
    backgroundColor: colors.surfaces.surfaceHighlight,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  accusedTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  accusedStatus: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.sm,
    color: colors.brand.accent,
  },
  tieBox: {
    backgroundColor: colors.surfaces.surfaceHighlight,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  tieTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.md,
    color: colors.semantic.warning,
    fontWeight: typography.fontWeight.bold,
  },
  tieDesc: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    color: colors.text.primary,
  },
  tieSub: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  lastChanceAtrashBox: {
    gap: spacing.sm,
  },
  lastChanceTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.sm,
    color: colors.semantic.error,
    fontWeight: typography.fontWeight.bold,
    textAlign: 'center',
  },
  lastChanceSub: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  optionBtn: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.surfaces.surfaceHighlight,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brand.primary,
    alignItems: 'center',
  },
  optionBtnText: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  lastChanceSpectatorBox: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  spectatorText: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  resultDetailsBox: {
    backgroundColor: colors.surfaces.surfaceHighlight,
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.xs,
  },
  secretWordNotice: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
  },
  secretWordHighlight: {
    fontWeight: typography.fontWeight.bold,
    color: colors.semantic.success,
  },
  atrashIdentityNotice: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
  },
  atrashNameHighlight: {
    fontWeight: typography.fontWeight.bold,
    color: colors.brand.primary,
  },
  pointsNotice: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    color: colors.brand.accent,
  },
  lastChanceOutcome: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  victoryEmoji: {
    fontSize: 48,
    textAlign: 'center',
  },
  victoryTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.gold,
    textAlign: 'center',
  },
  winnerName: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.md,
    color: colors.text.primary,
    textAlign: 'center',
    fontWeight: typography.fontWeight.bold,
  },
  victoryDesc: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  rolePeekBar: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.md,
    right: spacing.md,
  },
  rolePeekCard: {
    backgroundColor: colors.surfaces.surfaceHighlight,
    borderRadius: radius.lg,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.brand.accent,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  rolePeekHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rolePeekEye: {
    fontSize: 18,
  },
  rolePeekTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  roleSecretBox: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.surfaces.background,
  },
  atrashRoleBanner: {
    backgroundColor: '#3b1d1d',
    padding: spacing.xs,
    borderRadius: radius.sm,
    alignItems: 'center',
    gap: 2,
  },
  atrashBannerTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.semantic.error,
  },
  atrashBannerHint: {
    fontFamily: typography.fontFamily.body,
    fontSize: 10,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  informedRoleBanner: {
    backgroundColor: '#1d3b28',
    padding: spacing.xs,
    borderRadius: radius.sm,
    alignItems: 'center',
    gap: 2,
  },
  informedBannerTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.semantic.success,
  },
  informedWordText: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.gold,
  },
  informedBannerHint: {
    fontFamily: typography.fontFamily.body,
    fontSize: 10,
    color: colors.text.secondary,
    textAlign: 'center',
  },
});
