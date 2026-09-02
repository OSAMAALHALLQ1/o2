import {
  type AtrashPhase,
  type AtrashPlayerPrivateState,
  type AtrashPublicState,
  type AtrashQnAPair,
  type AtrashRole,
  type AtrashTurnStage,
  type AtrashVoteRecord,
  type AtrashWordItem,
  ATRASH_CONSTANTS,
  AtrashActionTypes,
  AtrashErrorCodes,
} from '@o2/types';
import {
  buildLastChanceOptions,
  getAtrashCategory,
  getRandomWordPackItem,
} from './atrash.content';

export class AtrashEngineError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AtrashEngineError';
    this.code = code;
  }
}

export interface AtrashParticipant {
  userId: string;
  username: string;
  displayName?: string;
  slotIndex: number;
  isReady: boolean;
  isConnected: boolean;
}

export interface AtrashInternalState {
  roomId: string;
  matchId: string;
  phase: AtrashPhase;
  roundNumber: number;
  participants: AtrashParticipant[];
  scores: Record<string, number>;
  targetScore: number;

  // Secret round context (Server-only!)
  categorySlug?: string;
  secretItem?: AtrashWordItem;
  roles: Record<string, AtrashRole>; // userId -> role
  atrashUserId?: string;

  // Role fairness history across rounds
  atrashHistory: Record<string, number>; // userId -> count of times assigned as Atrash
  lastAtrashUserId?: string;

  // Turn state
  currentTurnIndex: number;
  turnStage: AtrashTurnStage;
  currentAskerId?: string;
  currentAnswererId?: string;
  currentQuestionText?: string;
  turnStartedAt: number;
  turnDeadline: number;
  dialogueHistory: AtrashQnAPair[];

  // Discussion state
  discussionDeadline?: number;

  // Voting state
  votes: Map<string, AtrashVoteRecord>; // voterUserId -> vote
  votingDeadline?: number;
  isRevote: boolean;
  tiedCandidateIds: string[];

  // Vote reveal and last chance
  voteRevealData?: {
    votes: Record<string, string>;
    voteCounts: Record<string, number>;
    highestVotedUserId?: string;
    isTie: boolean;
    tiedUserIds: string[];
    isRevote: boolean;
    atrashDetected: boolean;
    revealedAtrashUserId: string;
  };
  lastChanceOptions?: string[];
  lastChanceChoice?: string;
  lastChanceDeadline?: number;
  lastChanceSuccess?: boolean;

  // Results
  roundResultData?: {
    roundNumber: number;
    secretWord: string;
    categoryNameAr: string;
    atrashUserId: string;
    atrashDetected: boolean;
    lastChanceAttempted: boolean;
    lastChanceSuccess: boolean;
    lastChanceChoice?: string;
    scoreDeltas: Record<string, number>;
    scores: Record<string, number>;
    winnerUserId?: string;
  };
  matchWinnerUserId?: string;

  // Determinism / PRNG seed
  testSeed?: number;
  rngCallCount: number;

  createdAt: number;
  updatedAt: number;
}

export interface AtrashEngineConfig {
  roomId?: string;
  matchId?: string;
  targetScore?: number;
  testSeed?: number;
  turnTimerSeconds?: number;
  discussionTimerSeconds?: number;
  votingTimerSeconds?: number;
  lastChanceTimerSeconds?: number;
}

/**
 * Deterministic PRNG using Mulberry32
 */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Simple deterministic question content rule validator.
 * Rejects questions attempting to leak or ask for the secret directly.
 */
export function validateQuestionContent(text: string): { isValid: boolean; code?: string; message?: string } {
  if (!text || typeof text !== 'string') {
    return { isValid: false, code: AtrashErrorCodes.QUESTION_TOO_SHORT, message: 'السؤال مطلوب' };
  }

  const trimmed = text.trim();
  if (trimmed.length < 3) {
    return { isValid: false, code: AtrashErrorCodes.QUESTION_TOO_SHORT, message: 'السؤال قصير جداً (الحد الأدنى 3 أحرف)' };
  }
  if (trimmed.length > 120) {
    return { isValid: false, code: AtrashErrorCodes.QUESTION_TOO_LONG, message: 'السؤال طويل جداً (الحد الأقصى 120 حرفاً)' };
  }

  // Prohibited direct-revelation patterns
  const prohibitedRegexes = [
    /ما\s*(هي)?\s*الكلم[ةه]/i,
    /شو\s*(هي)?\s*الكلم[ةه]/i,
    /إيش\s*(هي)?\s*الكلم[ةه]/i,
    /ايش\s*(هي)?\s*الكلم[ةه]/i,
    /احكي\s*(لي)?\s*الكلم[ةه]/i,
    /قول\s*الكلم[ةه]/i,
    /كم\s*(عدد)?\s*الحروف/i,
    /كم\s*حرف/i,
    /أول\s*حرف/i,
    /اول\s*حرف/i,
    /آخر\s*حرف/i,
    /اخر\s*حرف/i,
    /كيف\s*(بتنكتب|تنكتب|تكتب|تهجئتها)/i,
    /ما\s*هو\s*الحرف/i,
    /شو\s*الحرف/i,
  ];

  for (const rx of prohibitedRegexes) {
    if (rx.test(trimmed)) {
      return {
        isValid: false,
        code: AtrashErrorCodes.PROHIBITED_DIRECT_QUESTION,
        message: 'غير مسموح بالأسئلة المباشرة التي تطلب الكلمة أو حروفها صراحة',
      };
    }
  }

  return { isValid: true };
}

export function validateAnswerContent(text: string): { isValid: boolean; code?: string; message?: string } {
  if (!text || typeof text !== 'string') {
    return { isValid: false, code: AtrashErrorCodes.ANSWER_TOO_SHORT, message: 'الإجابة مطلوبة' };
  }
  const trimmed = text.trim();
  if (trimmed.length < 1) {
    return { isValid: false, code: AtrashErrorCodes.ANSWER_TOO_SHORT, message: 'الإجابة قصيرة جداً' };
  }
  if (trimmed.length > 150) {
    return { isValid: false, code: AtrashErrorCodes.ANSWER_TOO_LONG, message: 'الإجابة طويلة جداً' };
  }
  return { isValid: true };
}

export class AtrashGameEngine {
  private state: AtrashInternalState;
  readonly turnTimerMs: number;
  readonly discussionTimerMs: number;
  readonly votingTimerMs: number;
  readonly lastChanceTimerMs: number;

  constructor(config: AtrashEngineConfig = {}) {
    this.turnTimerMs = (config.turnTimerSeconds ?? ATRASH_CONSTANTS.DEFAULT_TURN_TIMER_SECONDS) * 1000;
    this.discussionTimerMs = (config.discussionTimerSeconds ?? ATRASH_CONSTANTS.DEFAULT_DISCUSSION_TIMER_SECONDS) * 1000;
    this.votingTimerMs = (config.votingTimerSeconds ?? ATRASH_CONSTANTS.DEFAULT_VOTING_TIMER_SECONDS) * 1000;
    this.lastChanceTimerMs = (config.lastChanceTimerSeconds ?? ATRASH_CONSTANTS.DEFAULT_LAST_CHANCE_TIMER_SECONDS) * 1000;

    this.state = {
      roomId: config.roomId ?? 'room_atrash',
      matchId: config.matchId ?? 'match_atrash',
      phase: 'LOBBY',
      roundNumber: 0,
      participants: [],
      scores: {},
      targetScore: config.targetScore ?? ATRASH_CONSTANTS.TARGET_WIN_SCORE,
      roles: {},
      atrashHistory: {},
      currentTurnIndex: 0,
      turnStage: 'ASKING',
      turnStartedAt: 0,
      turnDeadline: 0,
      dialogueHistory: [],
      votes: new Map(),
      isRevote: false,
      tiedCandidateIds: [],
      testSeed: config.testSeed,
      rngCallCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  // --- PRNG helper ---
  private getRandom(): number {
    this.state.rngCallCount += 1;
    if (typeof this.state.testSeed === 'number') {
      const prng = mulberry32(this.state.testSeed + this.state.rngCallCount * 101);
      return prng();
    }
    return Math.random();
  }

  get internalState(): Readonly<AtrashInternalState> {
    return this.state;
  }

  // ==========================================
  // PARTICIPANT & LOBBY MANAGEMENT
  // ==========================================

  setParticipants(participants: Array<{ userId: string; username: string; displayName?: string }>): void {
    if (this.state.phase !== 'LOBBY') {
      throw new AtrashEngineError(
        AtrashErrorCodes.INVALID_PHASE_TRANSITION,
        'لا يمكن تعديل المشاركين بعد بدء المباراة',
      );
    }

    if (participants.length > ATRASH_CONSTANTS.PUBLIC_PLAYER_COUNT) {
      throw new AtrashEngineError(
        AtrashErrorCodes.TOO_MANY_PLAYERS,
        `الحد الأقصى لعدد اللاعبين هو ${ATRASH_CONSTANTS.PUBLIC_PLAYER_COUNT}`,
      );
    }

    // Check duplicates
    const userIds = new Set<string>();
    for (const p of participants) {
      if (userIds.has(p.userId)) {
        throw new AtrashEngineError(AtrashErrorCodes.NOT_ENOUGH_PLAYERS, 'تكرار في هوية اللاعبين غير مسموح');
      }
      userIds.add(p.userId);
    }

    this.state.participants = participants.map((p, index) => ({
      userId: p.userId,
      username: p.username,
      displayName: p.displayName,
      slotIndex: index,
      isReady: true,
      isConnected: true,
    }));

    for (const p of this.state.participants) {
      if (this.state.scores[p.userId] === undefined) {
        this.state.scores[p.userId] = 0;
      }
      if (this.state.atrashHistory[p.userId] === undefined) {
        this.state.atrashHistory[p.userId] = 0;
      }
    }

    this.state.updatedAt = Date.now();
  }

  handleParticipantDisconnect(userId: string): void {
    const p = this.state.participants.find((x) => x.userId === userId);
    if (p) {
      p.isConnected = false;
      this.state.updatedAt = Date.now();
    }
  }

  handleParticipantReconnect(userId: string): void {
    const p = this.state.participants.find((x) => x.userId === userId);
    if (p) {
      p.isConnected = true;
      this.state.updatedAt = Date.now();
    }
  }

  // ==========================================
  // GAME & ROUND SETUP
  // ==========================================

  startGame(now = Date.now()): void {
    if (this.state.phase !== 'LOBBY') {
      throw new AtrashEngineError(
        AtrashErrorCodes.INVALID_PHASE_TRANSITION,
        `حالة المباراة الحالية (${this.state.phase}) لا تسمح ببدء اللعبة`,
      );
    }

    if (this.state.participants.length !== ATRASH_CONSTANTS.PUBLIC_PLAYER_COUNT) {
      throw new AtrashEngineError(
        AtrashErrorCodes.NOT_ENOUGH_PLAYERS,
        `يجب توفر بالضبط ${ATRASH_CONSTANTS.PUBLIC_PLAYER_COUNT} لاعبين لبدء المباراة`,
      );
    }

    this.state.phase = 'STARTING';
    this.state.roundNumber = 0;
    this.startNewRound(now);
  }

  startNewRound(now = Date.now()): void {
    if (this.state.phase !== 'STARTING' && this.state.phase !== 'ROUND_RESULT') {
      throw new AtrashEngineError(
        AtrashErrorCodes.INVALID_PHASE_TRANSITION,
        `لا يمكن بدء جولة جديدة من الحالة: ${this.state.phase}`,
      );
    }

    this.state.phase = 'ROUND_SETUP';
    this.state.roundNumber += 1;

    // Reset round-ephemeral structures
    this.state.dialogueHistory = [];
    this.state.votes.clear();
    this.state.voteRevealData = undefined;
    this.state.lastChanceOptions = undefined;
    this.state.lastChanceChoice = undefined;
    this.state.lastChanceSuccess = undefined;
    this.state.roundResultData = undefined;
    this.state.isRevote = false;
    this.state.tiedCandidateIds = [];

    // 1. Role Fairness selection for Atrash
    this.assignRolesFairly();

    // 2. Secret word & category selection
    const wordItem = getRandomWordPackItem(
      typeof this.state.testSeed === 'number'
        ? this.state.testSeed + this.state.roundNumber * 37
        : undefined,
    );
    this.state.secretItem = wordItem;
    this.state.categorySlug = wordItem.categorySlug;

    // 3. Transition to QUESTION_PHASE
    this.state.phase = 'QUESTION_PHASE';
    this.setupTurn(0, now);
    this.state.updatedAt = now;
  }

  /**
   * Fair role assignment:
   * 1. Check history of how many times each player has been Atrash.
   * 2. Find minimum count.
   * 3. Filter candidates with minimum count.
   * 4. Exclude last round's Atrash if possible.
   * 5. Deterministically select using PRNG.
   */
  private assignRolesFairly(): void {
    const participants = this.state.participants;
    let minTimes = Infinity;

    for (const p of participants) {
      const times = this.state.atrashHistory[p.userId] ?? 0;
      if (times < minTimes) minTimes = times;
    }

    let candidates = participants.filter(
      (p) => (this.state.atrashHistory[p.userId] ?? 0) === minTimes,
    );

    // If more than 1 candidate and one of them was the immediate previous Atrash, exclude them for fairness
    if (candidates.length > 1 && this.state.lastAtrashUserId) {
      const withoutLast = candidates.filter((p) => p.userId !== this.state.lastAtrashUserId);
      if (withoutLast.length > 0) {
        candidates = withoutLast;
      }
    }

    const selectedIndex = Math.floor(this.getRandom() * candidates.length);
    const chosenAtrash = candidates[selectedIndex];

    this.state.atrashUserId = chosenAtrash.userId;
    this.state.lastAtrashUserId = chosenAtrash.userId;
    this.state.atrashHistory[chosenAtrash.userId] = (this.state.atrashHistory[chosenAtrash.userId] ?? 0) + 1;

    this.state.roles = {};
    for (const p of participants) {
      this.state.roles[p.userId] = p.userId === chosenAtrash.userId ? 'ATRASH' : 'INFORMED';
    }
  }

  // ==========================================
  // QUESTION / ANSWER TURN STRUCTURE
  // ==========================================

  private setupTurn(turnIndex: number, now: number): void {
    const count = this.state.participants.length;
    this.state.currentTurnIndex = turnIndex;
    this.state.turnStage = 'ASKING';

    // Circular pairing: Turn i -> Player i asks Player (i+1)%count
    const askerIndex = turnIndex % count;
    const answererIndex = (turnIndex + 1) % count;

    this.state.currentAskerId = this.state.participants[askerIndex].userId;
    this.state.currentAnswererId = this.state.participants[answererIndex].userId;
    this.state.currentQuestionText = undefined;
    this.state.turnStartedAt = now;
    this.state.turnDeadline = now + this.turnTimerMs;
  }

  submitQuestion(userId: string, questionText: string, now = Date.now()): void {
    if (this.state.phase !== 'QUESTION_PHASE') {
      throw new AtrashEngineError(
        AtrashErrorCodes.INVALID_PHASE_TRANSITION,
        'لا يمكن طرح سؤال في هذه المرحلة',
      );
    }

    if (this.state.turnStage !== 'ASKING') {
      throw new AtrashEngineError(
        AtrashErrorCodes.INVALID_TURN_STAGE,
        'تم طرح السؤال بالفعل وبانتظار الإجابة',
      );
    }

    if (userId !== this.state.currentAskerId) {
      throw new AtrashEngineError(
        AtrashErrorCodes.NOT_YOUR_TURN,
        'ليس دورك لطرح السؤال',
      );
    }

    if (now > this.state.turnDeadline) {
      throw new AtrashEngineError(
        AtrashErrorCodes.TIMER_EXPIRED,
        'انتهى وقت طرح السؤال',
      );
    }

    const validation = validateQuestionContent(questionText);
    if (!validation.isValid) {
      throw new AtrashEngineError(validation.code!, validation.message!);
    }

    this.state.currentQuestionText = questionText.trim();
    this.state.turnStage = 'ANSWERING';
    this.state.turnStartedAt = now;
    this.state.turnDeadline = now + this.turnTimerMs;
    this.state.updatedAt = now;
  }

  submitAnswer(userId: string, answerText: string, now = Date.now()): void {
    if (this.state.phase !== 'QUESTION_PHASE') {
      throw new AtrashEngineError(
        AtrashErrorCodes.INVALID_PHASE_TRANSITION,
        'لا يمكن تقديم إجابة في هذه المرحلة',
      );
    }

    if (this.state.turnStage !== 'ANSWERING') {
      throw new AtrashEngineError(
        AtrashErrorCodes.INVALID_TURN_STAGE,
        'يجب طرح السؤال أولاً قبل الإجابة',
      );
    }

    if (userId !== this.state.currentAnswererId) {
      throw new AtrashEngineError(
        AtrashErrorCodes.NOT_YOUR_TURN,
        'ليس دورك للإجابة',
      );
    }

    if (now > this.state.turnDeadline) {
      throw new AtrashEngineError(
        AtrashErrorCodes.TIMER_EXPIRED,
        'انتهى وقت الإجابة',
      );
    }

    const validation = validateAnswerContent(answerText);
    if (!validation.isValid) {
      throw new AtrashEngineError(validation.code!, validation.message!);
    }

    // Record QnA pair
    this.state.dialogueHistory.push({
      turnIndex: this.state.currentTurnIndex,
      askerUserId: this.state.currentAskerId!,
      answererUserId: this.state.currentAnswererId!,
      questionText: this.state.currentQuestionText!,
      answerText: answerText.trim(),
      timestamp: now,
    });

    const nextTurnIndex = this.state.currentTurnIndex + 1;
    if (nextTurnIndex < ATRASH_CONSTANTS.PUBLIC_PLAYER_COUNT) {
      this.setupTurn(nextTurnIndex, now);
    } else {
      // 5 turns complete -> enter DISCUSSION_PHASE
      this.enterDiscussionPhase(now);
    }

    this.state.updatedAt = now;
  }

  handleTurnTimeout(now = Date.now()): { phaseChanged: boolean } {
    if (this.state.phase !== 'QUESTION_PHASE') return { phaseChanged: false };
    if (now < this.state.turnDeadline) return { phaseChanged: false };

    // Auto-fill default text if timeout occurred
    if (this.state.turnStage === 'ASKING') {
      this.state.currentQuestionText = 'هل ترتبط الكلمة بشيء تراه يومياً؟';
      this.state.turnStage = 'ANSWERING';
      this.state.turnStartedAt = now;
      this.state.turnDeadline = now + this.turnTimerMs;
      this.state.updatedAt = now;
      return { phaseChanged: false };
    } else {
      this.state.dialogueHistory.push({
        turnIndex: this.state.currentTurnIndex,
        askerUserId: this.state.currentAskerId!,
        answererUserId: this.state.currentAnswererId!,
        questionText: this.state.currentQuestionText ?? 'سؤال عام',
        answerText: 'أحياناً نعم وأحياناً لا',
        timestamp: now,
      });

      const nextTurn = this.state.currentTurnIndex + 1;
      if (nextTurn < ATRASH_CONSTANTS.PUBLIC_PLAYER_COUNT) {
        this.setupTurn(nextTurn, now);
        this.state.updatedAt = now;
        return { phaseChanged: false };
      } else {
        this.enterDiscussionPhase(now);
        this.state.updatedAt = now;
        return { phaseChanged: true };
      }
    }
  }

  // ==========================================
  // DISCUSSION PHASE
  // ==========================================

  private enterDiscussionPhase(now: number): void {
    this.state.phase = 'DISCUSSION_PHASE';
    this.state.discussionDeadline = now + this.discussionTimerMs;
    this.state.updatedAt = now;
  }

  advanceFromDiscussionToVoting(now = Date.now()): void {
    if (this.state.phase !== 'DISCUSSION_PHASE') {
      throw new AtrashEngineError(
        AtrashErrorCodes.INVALID_PHASE_TRANSITION,
        'الانتقال للتصويت متاح فقط من مرحلة النقاش',
      );
    }

    this.state.phase = 'VOTING';
    this.state.votes.clear();
    this.state.votingDeadline = now + this.votingTimerMs;
    this.state.updatedAt = now;
  }

  // ==========================================
  // VOTING & TIE HANDLING
  // ==========================================

  castVote(voterUserId: string, targetUserId: string, now = Date.now()): { allVoted: boolean } {
    if (this.state.phase !== 'VOTING') {
      throw new AtrashEngineError(
        AtrashErrorCodes.NOT_IN_VOTING_PHASE,
        'التصويت غير متاح في المرحلة الحالية',
      );
    }

    if (now > (this.state.votingDeadline ?? 0)) {
      throw new AtrashEngineError(AtrashErrorCodes.TIMER_EXPIRED, 'انتهى وقت التصويت');
    }

    const voter = this.state.participants.find((p) => p.userId === voterUserId);
    if (!voter) {
      throw new AtrashEngineError(AtrashErrorCodes.NOT_YOUR_TURN, 'المصوت ليس عضواً في المباراة');
    }

    if (this.state.votes.has(voterUserId)) {
      throw new AtrashEngineError(AtrashErrorCodes.ALREADY_VOTED, 'لقد قمت بالتصويت بالفعل');
    }

    if (voterUserId === targetUserId) {
      throw new AtrashEngineError(AtrashErrorCodes.CANNOT_VOTE_FOR_SELF, 'لا يمكنك التصويت لنفسك');
    }

    const target = this.state.participants.find((p) => p.userId === targetUserId);
    if (!target) {
      throw new AtrashEngineError(AtrashErrorCodes.INVALID_VOTE_TARGET, 'الهدف المحدد غير موجود');
    }

    // In revote, votes MUST target one of the tied candidates
    if (this.state.isRevote && this.state.tiedCandidateIds.length > 0) {
      if (!this.state.tiedCandidateIds.includes(targetUserId)) {
        throw new AtrashEngineError(
          AtrashErrorCodes.INVALID_VOTE_TARGET,
          'في جولة إعادة التصويت يجب اختيار أحد اللاعبين المتعادلين',
        );
      }
    }

    this.state.votes.set(voterUserId, {
      voterUserId,
      targetUserId,
      castAt: now,
    });
    this.state.updatedAt = now;

    // Check if all 5 players have voted
    const allVoted = this.state.votes.size >= this.state.participants.length;
    return { allVoted };
  }

  resolveVoting(now = Date.now()): {
    isTie: boolean;
    requiresRevote: boolean;
    nextPhase: AtrashPhase;
  } {
    if (this.state.phase !== 'VOTING') {
      throw new AtrashEngineError(
        AtrashErrorCodes.INVALID_PHASE_TRANSITION,
        'لا يمكن فرز الأصوات إلا في مرحلة التصويت',
      );
    }

    // Tally votes
    const counts: Record<string, number> = {};
    const voteMap: Record<string, string> = {};

    for (const p of this.state.participants) {
      counts[p.userId] = 0;
    }

    for (const [voterId, rec] of this.state.votes.entries()) {
      voteMap[voterId] = rec.targetUserId;
      counts[rec.targetUserId] = (counts[rec.targetUserId] ?? 0) + 1;
    }

    // Find highest vote count
    let maxVotes = -1;
    let highestUsers: string[] = [];

    for (const [userId, count] of Object.entries(counts)) {
      if (count > maxVotes) {
        maxVotes = count;
        highestUsers = [userId];
      } else if (count === maxVotes && maxVotes > 0) {
        highestUsers.push(userId);
      }
    }

    const isTie = highestUsers.length > 1;
    const atrashId = this.state.atrashUserId!;

    if (isTie) {
      if (!this.state.isRevote) {
        // First tie -> enter revote
        this.state.isRevote = true;
        this.state.tiedCandidateIds = highestUsers;
        this.state.phase = 'VOTING';
        this.state.votes.clear();
        this.state.votingDeadline = now + this.votingTimerMs;
        this.state.voteRevealData = {
          votes: voteMap,
          voteCounts: counts,
          highestVotedUserId: undefined,
          isTie: true,
          tiedUserIds: highestUsers,
          isRevote: true,
          atrashDetected: false,
          revealedAtrashUserId: atrashId,
        };
        this.state.updatedAt = now;
        return { isTie: true, requiresRevote: true, nextPhase: 'VOTING' };
      } else {
        // Second tie (revote still tied) -> Atrash survives! Round resolved in Atrash's favor!
        this.state.phase = 'VOTE_REVEAL';
        this.state.voteRevealData = {
          votes: voteMap,
          voteCounts: counts,
          highestVotedUserId: undefined,
          isTie: true,
          tiedUserIds: highestUsers,
          isRevote: true,
          atrashDetected: false,
          revealedAtrashUserId: atrashId,
        };
        this.state.updatedAt = now;
        return { isTie: true, requiresRevote: false, nextPhase: 'ROUND_RESULT' };
      }
    }

    // Single highest voted user
    const accusedUserId = highestUsers[0];
    const atrashDetected = accusedUserId === atrashId;

    this.state.phase = 'VOTE_REVEAL';
    this.state.voteRevealData = {
      votes: voteMap,
      voteCounts: counts,
      highestVotedUserId: accusedUserId,
      isTie: false,
      tiedUserIds: [],
      isRevote: this.state.isRevote,
      atrashDetected,
      revealedAtrashUserId: atrashId,
    };
    this.state.updatedAt = now;

    if (atrashDetected) {
      return { isTie: false, requiresRevote: false, nextPhase: 'ATRASH_LAST_CHANCE' };
    } else {
      return { isTie: false, requiresRevote: false, nextPhase: 'ROUND_RESULT' };
    }
  }

  // ==========================================
  // ATRASH LAST CHANCE
  // ==========================================

  startLastChance(now = Date.now()): { options: string[]; deadline: number } {
    if (this.state.phase !== 'VOTE_REVEAL') {
      throw new AtrashEngineError(
        AtrashErrorCodes.INVALID_PHASE_TRANSITION,
        'الفرصة الأخيرة تبدأ فقط بعد كشف التصويت',
      );
    }

    this.state.phase = 'ATRASH_LAST_CHANCE';
    const seed = typeof this.state.testSeed === 'number'
      ? this.state.testSeed + this.state.roundNumber * 77
      : undefined;

    const options = buildLastChanceOptions(this.state.secretItem!, seed);
    this.state.lastChanceOptions = options;
    this.state.lastChanceDeadline = now + this.lastChanceTimerMs;
    this.state.updatedAt = now;

    return { options, deadline: this.state.lastChanceDeadline };
  }

  submitLastChance(userId: string, selectedWord: string, now = Date.now()): { isCorrect: boolean } {
    if (this.state.phase !== 'ATRASH_LAST_CHANCE') {
      throw new AtrashEngineError(
        AtrashErrorCodes.NOT_IN_LAST_CHANCE_PHASE,
        'ليست مرحلة الفرصة الأخيرة للأطرش',
      );
    }

    if (userId !== this.state.atrashUserId) {
      throw new AtrashEngineError(
        AtrashErrorCodes.NOT_THE_ATRASH,
        'فقط الأطرش يمكنه اختيار الكلمة في الفرصة الأخيرة',
      );
    }

    if (!this.state.lastChanceOptions || !this.state.lastChanceOptions.includes(selectedWord)) {
      throw new AtrashEngineError(
        AtrashErrorCodes.INVALID_LAST_CHANCE_OPTION,
        'الخيار المحدد ليس ضمن الخيارات المتاحة',
      );
    }

    const correctWord = this.state.secretItem!.word;
    const isCorrect = selectedWord.trim() === correctWord.trim();

    this.state.lastChanceChoice = selectedWord;
    this.state.lastChanceSuccess = isCorrect;
    this.state.updatedAt = now;

    return { isCorrect };
  }

  // ==========================================
  // SCORING & ROUND / MATCH RESOLUTION
  // ==========================================

  finalizeRoundResult(now = Date.now()): {
    roundResult: AtrashInternalState['roundResultData'];
    matchFinished: boolean;
    winnerUserId?: string;
  } {
    const atrashId = this.state.atrashUserId!;
    const correctWord = this.state.secretItem!.word;
    const categoryDef = getAtrashCategory(this.state.categorySlug!)!;
    const reveal = this.state.voteRevealData;

    const atrashDetected = reveal?.atrashDetected ?? false;
    const lastChanceSuccess = Boolean(this.state.lastChanceSuccess);
    const scoreDeltas: Record<string, number> = {};

    for (const p of this.state.participants) {
      scoreDeltas[p.userId] = 0;
    }

    // SCORING RULES:
    // 1. Correct voters: +1 if they voted for the actual Atrash
    for (const [voterId, targetId] of Object.entries(reveal?.votes ?? {})) {
      if (targetId === atrashId && voterId !== atrashId) {
        scoreDeltas[voterId] = (scoreDeltas[voterId] ?? 0) + ATRASH_CONSTANTS.POINTS.CORRECT_VOTER;
      }
    }

    // 2. Atrash avoids detection (survives undetected or survives revote tie): +2
    if (!atrashDetected) {
      scoreDeltas[atrashId] = (scoreDeltas[atrashId] ?? 0) + ATRASH_CONSTANTS.POINTS.ATRASH_SURVIVED;
    }

    // 3. Atrash identified secret in last chance: +1
    if (atrashDetected && lastChanceSuccess) {
      scoreDeltas[atrashId] = (scoreDeltas[atrashId] ?? 0) + ATRASH_CONSTANTS.POINTS.ATRASH_LAST_CHANCE_CORRECT;
    }

    // Apply score deltas to persistent scores
    for (const [userId, delta] of Object.entries(scoreDeltas)) {
      this.state.scores[userId] = (this.state.scores[userId] ?? 0) + delta;
    }

    // Check race-to-5 victory condition
    let matchWinnerId: string | undefined;
    let maxScore = -1;

    for (const [userId, score] of Object.entries(this.state.scores)) {
      if (score >= this.state.targetScore && score > maxScore) {
        maxScore = score;
        matchWinnerId = userId;
      }
    }

    this.state.roundResultData = {
      roundNumber: this.state.roundNumber,
      secretWord: correctWord,
      categoryNameAr: categoryDef.nameAr,
      atrashUserId: atrashId,
      atrashDetected,
      lastChanceAttempted: atrashDetected,
      lastChanceSuccess,
      lastChanceChoice: this.state.lastChanceChoice,
      scoreDeltas,
      scores: { ...this.state.scores },
      winnerUserId: matchWinnerId,
    };

    if (matchWinnerId) {
      this.state.phase = 'MATCH_RESULT';
      this.state.matchWinnerUserId = matchWinnerId;
    } else {
      this.state.phase = 'ROUND_RESULT';
    }

    this.state.updatedAt = now;

    return {
      roundResult: this.state.roundResultData,
      matchFinished: Boolean(matchWinnerId),
      winnerUserId: matchWinnerId,
    };
  }

  // ==========================================
  // STATE PROJECTIONS (ZERO LEAKAGE)
  // ==========================================

  getPublicProjection(now = Date.now()): AtrashPublicState {
    const cat = this.state.categorySlug ? getAtrashCategory(this.state.categorySlug) : undefined;
    const votedUserIds = Array.from(this.state.votes.keys());

    let turnProjection: AtrashPublicState['turn'];
    if (this.state.phase === 'QUESTION_PHASE' && this.state.currentAskerId && this.state.currentAnswererId) {
      const remainingSec = Math.max(0, Math.ceil((this.state.turnDeadline - now) / 1000));
      turnProjection = {
        currentTurnIndex: this.state.currentTurnIndex,
        totalTurns: ATRASH_CONSTANTS.PUBLIC_PLAYER_COUNT,
        askerUserId: this.state.currentAskerId,
        answererUserId: this.state.currentAnswererId,
        stage: this.state.turnStage,
        questionText: this.state.currentQuestionText,
        turnDeadline: this.state.turnDeadline,
        timeRemainingSeconds: remainingSec,
      };
    }

    let matchResultProj: AtrashPublicState['matchResult'];
    if (this.state.phase === 'MATCH_RESULT' && this.state.matchWinnerUserId) {
      const winner = this.state.participants.find((p) => p.userId === this.state.matchWinnerUserId);
      matchResultProj = {
        matchId: this.state.matchId,
        winnerUserId: this.state.matchWinnerUserId,
        winnerUsername: winner?.username ?? 'البطل',
        finalScores: { ...this.state.scores },
        totalRounds: this.state.roundNumber,
        completedAt: this.state.updatedAt,
        participantDetails: this.state.participants.map((p) => ({
          userId: p.userId,
          username: p.username,
          displayName: p.displayName,
          finalScore: this.state.scores[p.userId] ?? 0,
        })),
      };
    }

    return {
      roomId: this.state.roomId,
      gameMode: 'ATRASH',
      phase: this.state.phase,
      roundNumber: this.state.roundNumber,
      scores: { ...this.state.scores },
      targetScore: this.state.targetScore,
      participants: this.state.participants.map((p) => ({
        userId: p.userId,
        username: p.username,
        displayName: p.displayName,
        isReady: p.isReady,
        isConnected: p.isConnected,
      })),
      category: cat ? { slug: cat.slug, nameAr: cat.nameAr, icon: cat.icon } : undefined,
      turn: turnProjection,
      dialogueHistory: [...this.state.dialogueHistory],
      discussionDeadline: this.state.discussionDeadline,
      votingDeadline: this.state.votingDeadline,
      votedUserIds,
      voteReveal: this.state.voteRevealData,
      lastChance: this.state.lastChanceOptions
        ? {
            atrashUserId: this.state.atrashUserId!,
            deadline: this.state.lastChanceDeadline ?? 0,
            options: this.state.lastChanceOptions,
          }
        : undefined,
      roundResult: this.state.roundResultData,
      matchResult: matchResultProj,
      serverTimestamp: now,
    };
  }

  getPlayerProjection(userId: string, _now = Date.now()): AtrashPlayerPrivateState {
    const role: AtrashRole = this.state.roles[userId] ?? 'INFORMED';
    const isAtrash = role === 'ATRASH';
    const cat = this.state.categorySlug ? getAtrashCategory(this.state.categorySlug) : undefined;

    // STRICT INVARIANT: Secret word is NEVER delivered to Atrash!
    // Secret word is revealed to all only in ROUND_RESULT / MATCH_RESULT.
    let secretWord: string | undefined;
    if (this.state.phase === 'ROUND_RESULT' || this.state.phase === 'MATCH_RESULT') {
      secretWord = this.state.secretItem?.word;
    } else if (!isAtrash) {
      secretWord = this.state.secretItem?.word;
    }

    const isMyTurn =
      this.state.phase === 'QUESTION_PHASE' &&
      (userId === this.state.currentAskerId || userId === this.state.currentAnswererId);

    let myTurnRole: 'ASKER' | 'ANSWERER' | undefined;
    if (userId === this.state.currentAskerId) myTurnRole = 'ASKER';
    else if (userId === this.state.currentAnswererId) myTurnRole = 'ANSWERER';

    const hasVoted = this.state.votes.has(userId);
    const myVoteTarget = this.state.votes.get(userId)?.targetUserId;

    const availableActions: string[] = [];
    if (this.state.phase === 'LOBBY') {
      availableActions.push(AtrashActionTypes.START_GAME);
    }
    if (this.state.phase === 'QUESTION_PHASE') {
      if (userId === this.state.currentAskerId && this.state.turnStage === 'ASKING') {
        availableActions.push(AtrashActionTypes.SUBMIT_QUESTION);
      }
      if (userId === this.state.currentAnswererId && this.state.turnStage === 'ANSWERING') {
        availableActions.push(AtrashActionTypes.SUBMIT_ANSWER);
      }
    }
    if (this.state.phase === 'VOTING' && !hasVoted) {
      availableActions.push(AtrashActionTypes.CAST_VOTE);
    }
    if (this.state.phase === 'ATRASH_LAST_CHANCE' && isAtrash && !this.state.lastChanceChoice) {
      availableActions.push(AtrashActionTypes.SUBMIT_LAST_CHANCE);
    }

    return {
      userId,
      role,
      isAtrash,
      category: cat ? { slug: cat.slug, nameAr: cat.nameAr, icon: cat.icon } : undefined,
      secretWord,
      isMyTurn,
      myTurnRole,
      hasVoted,
      myVoteTarget,
      lastChanceOptions: isAtrash ? this.state.lastChanceOptions : undefined,
      availableActions,
    };
  }
}
