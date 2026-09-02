import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AtrashEngineError,
  AtrashGameEngine,
  validateQuestionContent,
} from '../dist/index.js';
import { ATRASH_CONSTANTS, AtrashErrorCodes } from '@o2/types';

function createFivePlayers() {
  return [
    { userId: 'u1', username: 'anass' },
    { userId: 'u2', username: 'kareem' },
    { userId: 'u3', username: 'nour' },
    { userId: 'u4', username: 'salma' },
    { userId: 'u5', username: 'tarek' },
  ];
}

describe('Phase 7: Atrash Bel Zaffeh — Deterministic Game Core Engine', () => {

  // ==========================================================================
  // 1–3: PLAYER COUNT & ROLE COMPOSITION
  // ==========================================================================
  describe('1-3. Player Count & Role Composition', () => {
    it('1. requires exactly 5 players for public match', () => {
      const engine = new AtrashGameEngine();
      
      // Less than 5
      assert.throws(
        () => {
          engine.setParticipants(createFivePlayers().slice(0, 4));
          engine.startGame();
        },
        (err: any) => err instanceof AtrashEngineError && err.code === AtrashErrorCodes.NOT_ENOUGH_PLAYERS,
      );

      // More than 5
      const engine2 = new AtrashGameEngine();
      assert.throws(
        () => {
          engine2.setParticipants([
            ...createFivePlayers(),
            { userId: 'u6', username: 'extra' },
          ]);
        },
        (err: any) => err instanceof AtrashEngineError && err.code === AtrashErrorCodes.TOO_MANY_PLAYERS,
      );

      // Duplicate players rejected
      const engine3 = new AtrashGameEngine();
      assert.throws(
        () => {
          engine3.setParticipants([
            { userId: 'u1', username: 'anass' },
            { userId: 'u1', username: 'anass' },
            { userId: 'u3', username: 'nour' },
            { userId: 'u4', username: 'salma' },
            { userId: 'u5', username: 'tarek' },
          ]);
        },
        (err: any) => err instanceof AtrashEngineError && err.code === AtrashErrorCodes.NOT_ENOUGH_PLAYERS,
      );
    });

    it('2. assigns exactly 1 Atrash', () => {
      const engine = new AtrashGameEngine({ testSeed: 12345 });
      engine.setParticipants(createFivePlayers());
      engine.startGame();

      const roles = engine.internalState.roles;
      const atrashRoles = Object.values(roles).filter((r) => r === 'ATRASH');
      assert.equal(atrashRoles.length, 1);
      assert.ok(engine.internalState.atrashUserId);
    });

    it('3. assigns exactly 4 informed players', () => {
      const engine = new AtrashGameEngine({ testSeed: 54321 });
      engine.setParticipants(createFivePlayers());
      engine.startGame();

      const roles = engine.internalState.roles;
      const informedRoles = Object.values(roles).filter((r) => r === 'INFORMED');
      assert.equal(informedRoles.length, 4);
    });
  });

  // ==========================================================================
  // 4–7: ROLE SECRECY, PROJECTION ISOLATION & FAIRNESS
  // ==========================================================================
  describe('4-7. Role Secrecy, Projection Isolation & Fairness', () => {
    it('4. enforces role secrecy (Atrash role hidden from other players)', () => {
      const engine = new AtrashGameEngine({ testSeed: 999 });
      engine.setParticipants(createFivePlayers());
      engine.startGame();

      const atrashId = engine.internalState.atrashUserId!;
      const informedId = engine.internalState.participants.find((p) => p.userId !== atrashId)!.userId;

      // Informed player projection does NOT reveal who the Atrash is
      const informedProj = engine.getPlayerProjection(informedId);
      assert.equal(informedProj.role, 'INFORMED');
      assert.equal(informedProj.isAtrash, false);
      assert.equal((informedProj as any).atrashUserId, undefined);
    });

    it('5. isolates public and private projections (secret not in public projection)', () => {
      const engine = new AtrashGameEngine({ testSeed: 999 });
      engine.setParticipants(createFivePlayers());
      engine.startGame();

      const publicProj = engine.getPublicProjection();
      assert.equal((publicProj as any).secretWord, undefined);
      assert.equal((publicProj as any).secretItem, undefined);
      assert.equal((publicProj as any).roles, undefined);
      assert.equal((publicProj as any).atrashUserId, undefined);

      const atrashId = engine.internalState.atrashUserId!;
      const atrashProj = engine.getPlayerProjection(atrashId);
      assert.equal(atrashProj.role, 'ATRASH');
      assert.equal(atrashProj.isAtrash, true);
      assert.equal(atrashProj.secretWord, undefined); // Zero secret leakage to Atrash!
      assert.ok(atrashProj.category); // But knows the category
    });

    it('6. produces deterministic role assignment with test seed', () => {
      const engine1 = new AtrashGameEngine({ testSeed: 42 });
      engine1.setParticipants(createFivePlayers());
      engine1.startGame();

      const engine2 = new AtrashGameEngine({ testSeed: 42 });
      engine2.setParticipants(createFivePlayers());
      engine2.startGame();

      assert.equal(engine1.internalState.atrashUserId, engine2.internalState.atrashUserId);
      assert.deepEqual(engine1.internalState.roles, engine2.internalState.roles);
      assert.equal(engine1.internalState.secretItem?.word, engine2.internalState.secretItem?.word);
    });

    it('7. executes fair role-selection strategy across repeated rounds without repeating last Atrash', () => {
      const engine = new AtrashGameEngine({ testSeed: 777 });
      engine.setParticipants(createFivePlayers());
      engine.startGame();

      const assignedAtrashSet = new Set<string>();
      assignedAtrashSet.add(engine.internalState.atrashUserId!);

      // Complete 4 more rounds and verify that all 5 players get chosen
      for (let r = 0; r < 4; r++) {
        const lastAtrash = engine.internalState.atrashUserId!;
        // Advance round artificially
        engine.internalState.phase = 'ROUND_RESULT';
        engine.startNewRound();
        const currentAtrash = engine.internalState.atrashUserId!;
        // Must not immediately repeat previous Atrash when unassigned players remain
        assert.notEqual(currentAtrash, lastAtrash);
        assignedAtrashSet.add(currentAtrash);
      }

      // Across 5 rounds with 5 players, all 5 must have had a turn as Atrash
      assert.equal(assignedAtrashSet.size, 5);
    });
  });

  // ==========================================================================
  // 8–13: TURN SYSTEM, VALIDATIONS & DISCUSSION TRANSITION
  // ==========================================================================
  describe('8-13. Turn System, Validations & Discussion Transition', () => {
    it('8. enforces deterministic turn ordering (5 turns in circle)', () => {
      const engine = new AtrashGameEngine({ testSeed: 100 });
      engine.setParticipants(createFivePlayers());
      engine.startGame();

      assert.equal(engine.internalState.currentTurnIndex, 0);
      assert.equal(engine.internalState.currentAskerId, 'u1');
      assert.equal(engine.internalState.currentAnswererId, 'u2');
      assert.equal(engine.internalState.turnStage, 'ASKING');
    });

    it('9. accepts valid question and answer actions', () => {
      const engine = new AtrashGameEngine({ testSeed: 100 });
      engine.setParticipants(createFivePlayers());
      engine.startGame();

      // u1 asks u2
      engine.submitQuestion('u1', 'هل هذا الشيء يوجد في كل منزل؟');
      assert.equal(engine.internalState.turnStage, 'ANSWERING');

      // u2 answers
      engine.submitAnswer('u2', 'نعم بنسبة كبيرة جداً');
      assert.equal(engine.internalState.currentTurnIndex, 1);
      assert.equal(engine.internalState.currentAskerId, 'u2');
      assert.equal(engine.internalState.currentAnswererId, 'u3');
      assert.equal(engine.internalState.turnStage, 'ASKING');
      assert.equal(engine.internalState.dialogueHistory.length, 1);
    });

    it('10. rejects out-of-turn actions', () => {
      const engine = new AtrashGameEngine({ testSeed: 100 });
      engine.setParticipants(createFivePlayers());
      engine.startGame();

      // u3 tries to ask when it is u1's turn
      assert.throws(
        () => engine.submitQuestion('u3', 'هل يستخدم بالكهرباء؟'),
        (err: any) => err instanceof AtrashEngineError && err.code === AtrashErrorCodes.NOT_YOUR_TURN,
      );

      // u1 asks
      engine.submitQuestion('u1', 'هل يستخدم بالكهرباء؟');

      // u4 tries to answer when it is u2's turn to answer
      assert.throws(
        () => engine.submitAnswer('u4', 'نعم بالتأكيد'),
        (err: any) => err instanceof AtrashEngineError && err.code === AtrashErrorCodes.NOT_YOUR_TURN,
      );
    });

    it('11. rejects duplicate action / invalid stage action', () => {
      const engine = new AtrashGameEngine({ testSeed: 100 });
      engine.setParticipants(createFivePlayers());
      engine.startGame();

      engine.submitQuestion('u1', 'هل هو خفيف الوزن؟');

      // u1 tries to ask again in ANSWERING stage
      assert.throws(
        () => engine.submitQuestion('u1', 'سؤال آخر'),
        (err: any) => err instanceof AtrashEngineError && err.code === AtrashErrorCodes.INVALID_TURN_STAGE,
      );
    });

    it('12. rejects expired turn action and handles turn timeout safely', () => {
      const engine = new AtrashGameEngine({ testSeed: 100, turnTimerSeconds: 10 });
      engine.setParticipants(createFivePlayers());
      const startTime = 1_000_000;
      engine.startGame(startTime);

      // Action after deadline
      assert.throws(
        () => engine.submitQuestion('u1', 'هل هو كبير؟', startTime + 15_000),
        (err: any) => err instanceof AtrashEngineError && err.code === AtrashErrorCodes.TIMER_EXPIRED,
      );

      // Turn timeout auto-fills fallback question
      const timeoutRes = engine.handleTurnTimeout(startTime + 12_000);
      assert.equal(timeoutRes.phaseChanged, false);
      assert.equal(engine.internalState.turnStage, 'ANSWERING');
    });

    it('13. transitions cleanly to DISCUSSION_PHASE after 5 turns', () => {
      const engine = new AtrashGameEngine({ testSeed: 100 });
      engine.setParticipants(createFivePlayers());
      engine.startGame();

      // Complete all 5 turns
      const pairs = [
        ['u1', 'u2'],
        ['u2', 'u3'],
        ['u3', 'u4'],
        ['u4', 'u5'],
        ['u5', 'u1'],
      ];

      for (let i = 0; i < 5; i++) {
        const [asker, answerer] = pairs[i];
        engine.submitQuestion(asker, `سؤال رقم ${i + 1} عن الكلمة؟`);
        engine.submitAnswer(answerer, `إجابة رقم ${i + 1} مفصلة`);
      }

      assert.equal(engine.internalState.phase, 'DISCUSSION_PHASE');
      assert.ok(engine.internalState.discussionDeadline);
      assert.equal(engine.internalState.dialogueHistory.length, 5);
    });

    it('rejects prohibited direct-reveal questions deterministically', () => {
      assert.equal(validateQuestionContent('ما هي الكلمة؟').isValid, false);
      assert.equal(validateQuestionContent('شو الكلمة بالضبط').isValid, false);
      assert.equal(validateQuestionContent('كم حرف في الكلمة؟').isValid, false);
      assert.equal(validateQuestionContent('أول حرف منها شو؟').isValid, false);
      assert.equal(validateQuestionContent('كيف بتنكتب الكلمة؟').isValid, false);
      assert.equal(validateQuestionContent('هل هي مصنوعة من الخشب؟').isValid, true);
    });
  });

  // ==========================================================================
  // 14–21: VOTING, SECRET VOTES, TIES & REVOTE
  // ==========================================================================
  describe('14-21. Voting, Secret Votes, Ties & Revote', () => {
    function setupVotingEngine(atrashUserIndex = 0) {
      const engine = new AtrashGameEngine({ testSeed: 200 });
      engine.setParticipants(createFivePlayers());
      engine.startGame();

      // Override atrash user for precise test control
      const targetAtrashId = createFivePlayers()[atrashUserIndex].userId;
      engine.internalState.atrashUserId = targetAtrashId;
      for (const p of createFivePlayers()) {
        engine.internalState.roles[p.userId] = p.userId === targetAtrashId ? 'ATRASH' : 'INFORMED';
      }

      // Transition to VOTING
      engine.internalState.phase = 'DISCUSSION_PHASE';
      engine.advanceFromDiscussionToVoting();
      return { engine, targetAtrashId };
    }

    it('14. allows one vote per active player', () => {
      const { engine } = setupVotingEngine();
      const res = engine.castVote('u1', 'u2');
      assert.equal(res.allVoted, false);
      assert.equal(engine.internalState.votes.size, 1);
    });

    it('15. rejects invalid vote target (self-vote or non-existent target)', () => {
      const { engine } = setupVotingEngine();

      // Self-vote
      assert.throws(
        () => engine.castVote('u1', 'u1'),
        (err: any) => err instanceof AtrashEngineError && err.code === AtrashErrorCodes.CANNOT_VOTE_FOR_SELF,
      );

      // Unknown user
      assert.throws(
        () => engine.castVote('u1', 'ghost_user'),
        (err: any) => err instanceof AtrashEngineError && err.code === AtrashErrorCodes.INVALID_VOTE_TARGET,
      );
    });

    it('16. rejects duplicate votes from same player', () => {
      const { engine } = setupVotingEngine();
      engine.castVote('u1', 'u2');

      assert.throws(
        () => engine.castVote('u1', 'u3'),
        (err: any) => err instanceof AtrashEngineError && err.code === AtrashErrorCodes.ALREADY_VOTED,
      );
    });

    it('17. enforces vote secrecy (public state hides vote targets during voting)', () => {
      const { engine } = setupVotingEngine();
      engine.castVote('u1', 'u2');
      engine.castVote('u3', 'u4');

      const pub = engine.getPublicProjection();
      assert.deepEqual(pub.votedUserIds.sort(), ['u1', 'u3']);
      assert.equal(pub.voteReveal, undefined); // Not revealed yet
    });

    it('18. accurately tallies votes on reveal', () => {
      const { engine, targetAtrashId } = setupVotingEngine(0); // u1 is Atrash

      // u2, u3, u4 vote for u1 (3 votes for Atrash)
      // u1 votes for u2, u5 votes for u2 (2 votes for u2)
      engine.castVote('u2', targetAtrashId);
      engine.castVote('u3', targetAtrashId);
      engine.castVote('u4', targetAtrashId);
      engine.castVote('u1', 'u2');
      engine.castVote('u5', 'u2');

      const resolveRes = engine.resolveVoting();
      assert.equal(resolveRes.isTie, false);
      assert.equal(resolveRes.nextPhase, 'ATRASH_LAST_CHANCE');

      const reveal = engine.internalState.voteRevealData!;
      assert.equal(reveal.highestVotedUserId, targetAtrashId);
      assert.equal(reveal.atrashDetected, true);
      assert.equal(reveal.voteCounts[targetAtrashId], 3);
    });

    it('19-20. handles vote tie by triggering revote between tied candidates', () => {
      const { engine } = setupVotingEngine(0); // u1 is Atrash

      // 2 votes for u2, 2 votes for u3, 1 vote for u4
      engine.castVote('u1', 'u2');
      engine.castVote('u5', 'u2');
      engine.castVote('u2', 'u3');
      engine.castVote('u4', 'u3');
      engine.castVote('u3', 'u4');

      const res = engine.resolveVoting();
      assert.equal(res.isTie, true);
      assert.equal(res.requiresRevote, true);
      assert.equal(engine.internalState.phase, 'VOTING');
      assert.equal(engine.internalState.isRevote, true);
      assert.deepEqual(engine.internalState.tiedCandidateIds.sort(), ['u2', 'u3']);
    });

    it('21. resolves second tie in Atrash favor (Atrash survives)', () => {
      const { engine, targetAtrashId } = setupVotingEngine(0); // u1 is Atrash

      // Tie in first vote
      engine.castVote('u1', 'u2');
      engine.castVote('u5', 'u2');
      engine.castVote('u2', 'u3');
      engine.castVote('u4', 'u3');
      engine.castVote('u3', 'u2'); // wait: u2 has 3 votes, let's tie:
      // Let's reset votes manually for exact tie
      engine.internalState.votes.clear();
      engine.castVote('u1', 'u2');
      engine.castVote('u5', 'u2');
      engine.castVote('u2', 'u3');
      engine.castVote('u4', 'u3');
      engine.castVote('u3', 'u4'); // u2: 2, u3: 2, u4: 1

      engine.resolveVoting();
      assert.equal(engine.internalState.isRevote, true);

      // Now revote is also tied between u2 and u3
      engine.castVote('u1', 'u2');
      engine.castVote('u4', 'u2');
      engine.castVote('u2', 'u3');
      engine.castVote('u5', 'u3');
      engine.castVote('u3', 'u2'); // 3 for u2, 2 for u3 -> wait, tie:
      engine.internalState.votes.clear();
      engine.castVote('u1', 'u2');
      engine.castVote('u4', 'u2');
      engine.castVote('u2', 'u3');
      engine.castVote('u5', 'u3');
      // u3 abstains / timeout, tied 2-2

      const secondResolve = engine.resolveVoting();
      assert.equal(secondResolve.isTie, true);
      assert.equal(secondResolve.requiresRevote, false);
      assert.equal(secondResolve.nextPhase, 'ROUND_RESULT');

      // Finalize round: Atrash survives because vote remained tied!
      const finalizeRes = engine.finalizeRoundResult();
      assert.equal(finalizeRes.roundResult?.atrashDetected, false);
      // Atrash receives +2 survival points
      assert.equal(finalizeRes.roundResult?.scoreDeltas[targetAtrashId], 2);
    });
  });

  // ==========================================================================
  // 22–24: ATRASH LAST CHANCE
  // ==========================================================================
  describe('22-24. Atrash Last Chance', () => {
    function setupLastChanceEngine() {
      const engine = new AtrashGameEngine({ testSeed: 300 });
      engine.setParticipants(createFivePlayers());
      engine.startGame();

      const atrashId = 'u1';
      engine.internalState.atrashUserId = atrashId;
      for (const p of createFivePlayers()) {
        engine.internalState.roles[p.userId] = p.userId === atrashId ? 'ATRASH' : 'INFORMED';
      }

      // Force state to VOTE_REVEAL with Atrash caught
      engine.internalState.phase = 'VOTE_REVEAL';
      engine.internalState.voteRevealData = {
        votes: { u2: 'u1', u3: 'u1', u4: 'u1', u5: 'u1', u1: 'u2' },
        voteCounts: { u1: 4, u2: 1, u3: 0, u4: 0, u5: 0 },
        highestVotedUserId: 'u1',
        isTie: false,
        tiedUserIds: [],
        isRevote: false,
        atrashDetected: true,
        revealedAtrashUserId: 'u1',
      };

      return { engine, atrashId };
    }

    it('22. generates exactly 4 candidate options containing the secret word', () => {
      const { engine } = setupLastChanceEngine();
      const { options } = engine.startLastChance();

      assert.equal(options.length, 4);
      const secret = engine.internalState.secretItem!.word;
      assert.ok(options.includes(secret));
    });

    it('23. handles incorrect last chance submission (no bonus points)', () => {
      const { engine, atrashId } = setupLastChanceEngine();
      const { options } = engine.startLastChance();
      const secret = engine.internalState.secretItem!.word;
      const wrongOption = options.find((o) => o !== secret)!;

      const guessRes = engine.submitLastChance(atrashId, wrongOption);
      assert.equal(guessRes.isCorrect, false);

      const finalizeRes = engine.finalizeRoundResult();
      assert.equal(finalizeRes.roundResult?.lastChanceSuccess, false);
      assert.equal(finalizeRes.roundResult?.scoreDeltas[atrashId], 0);
    });

    it('24. handles correct last chance submission (+1 bonus point to Atrash)', () => {
      const { engine, atrashId } = setupLastChanceEngine();
      engine.startLastChance();
      const secret = engine.internalState.secretItem!.word;

      const guessRes = engine.submitLastChance(atrashId, secret);
      assert.equal(guessRes.isCorrect, true);

      const finalizeRes = engine.finalizeRoundResult();
      assert.equal(finalizeRes.roundResult?.lastChanceSuccess, true);
      assert.equal(finalizeRes.roundResult?.scoreDeltas[atrashId], 1); // +1 point for correct guess
    });
  });

  // ==========================================================================
  // 25–30: SCORING, MATCH VICTORY & PROGRESSION
  // ==========================================================================
  describe('25-30. Scoring, Match Victory & Progression', () => {
    it('25-27. awards +1 to correct voters, +2 to surviving Atrash, verifies total scores', () => {
      const engine = new AtrashGameEngine({ testSeed: 500 });
      engine.setParticipants(createFivePlayers());
      engine.startGame();

      const atrashId = 'u5';
      engine.internalState.atrashUserId = atrashId;
      for (const p of createFivePlayers()) {
        engine.internalState.roles[p.userId] = p.userId === atrashId ? 'ATRASH' : 'INFORMED';
      }

      // Scenario A: u1 and u2 correctly vote for u5; u3, u4, u5 vote for u2 (u2 falsely accused!)
      engine.internalState.phase = 'VOTE_REVEAL';
      engine.internalState.voteRevealData = {
        votes: { u1: 'u5', u2: 'u5', u3: 'u2', u4: 'u2', u5: 'u2' },
        voteCounts: { u5: 2, u2: 3, u1: 0, u3: 0, u4: 0 },
        highestVotedUserId: 'u2',
        isTie: false,
        tiedUserIds: [],
        isRevote: false,
        atrashDetected: false, // Atrash survived!
        revealedAtrashUserId: 'u5',
      };

      const res = engine.finalizeRoundResult();
      // u1 and u2 voted for actual Atrash -> +1 each
      assert.equal(res.roundResult?.scoreDeltas['u1'], 1);
      assert.equal(res.roundResult?.scoreDeltas['u2'], 1);
      // u5 (Atrash) avoided detection -> +2 points
      assert.equal(res.roundResult?.scoreDeltas['u5'], 2);
      // Others: 0
      assert.equal(res.roundResult?.scoreDeltas['u3'], 0);
      assert.equal(res.roundResult?.scoreDeltas['u4'], 0);

      // Cumulative scores
      assert.equal(engine.internalState.scores['u5'], 2);
      assert.equal(engine.internalState.scores['u1'], 1);
    });

    it('28. declares match victory on race-to-5 points', () => {
      const engine = new AtrashGameEngine({ testSeed: 500, targetScore: 5 });
      engine.setParticipants(createFivePlayers());
      engine.startGame();

      // Pre-seed scores so u1 has 4 points
      engine.internalState.scores['u1'] = 4;
      engine.internalState.atrashUserId = 'u5';

      // u1 votes for u5 (Atrash) and catches them -> u1 gets +1 -> reaches 5!
      engine.internalState.phase = 'VOTE_REVEAL';
      engine.internalState.voteRevealData = {
        votes: { u1: 'u5', u2: 'u5', u3: 'u5', u4: 'u5', u5: 'u1' },
        voteCounts: { u5: 4, u1: 1, u2: 0, u3: 0, u4: 0 },
        highestVotedUserId: 'u5',
        isTie: false,
        tiedUserIds: [],
        isRevote: false,
        atrashDetected: true,
        revealedAtrashUserId: 'u5',
      };

      const res = engine.finalizeRoundResult();
      assert.equal(res.matchFinished, true);
      assert.equal(res.winnerUserId, 'u1');
      assert.equal(engine.internalState.phase, 'MATCH_RESULT');
    });

    it('29. prevents premature match end before 5 points', () => {
      const engine = new AtrashGameEngine({ targetScore: 5 });
      engine.setParticipants(createFivePlayers());
      engine.startGame();

      engine.internalState.scores['u1'] = 3;
      engine.internalState.phase = 'VOTE_REVEAL';
      engine.internalState.voteRevealData = {
        votes: { u1: 'u5', u2: 'u5', u3: 'u5', u4: 'u5', u5: 'u1' },
        voteCounts: { u5: 4, u1: 1, u2: 0, u3: 0, u4: 0 },
        highestVotedUserId: 'u5',
        isTie: false,
        tiedUserIds: [],
        isRevote: false,
        atrashDetected: true,
        revealedAtrashUserId: 'u5',
      };

      const res = engine.finalizeRoundResult();
      assert.equal(res.matchFinished, false);
      assert.equal(engine.internalState.phase, 'ROUND_RESULT');
    });

    it('30. supports round progression when match is not finished', () => {
      const engine = new AtrashGameEngine({ testSeed: 900 });
      engine.setParticipants(createFivePlayers());
      engine.startGame();

      engine.internalState.phase = 'ROUND_RESULT';
      engine.startNewRound();
      assert.equal(engine.internalState.roundNumber, 2);
      assert.equal(engine.internalState.phase, 'QUESTION_PHASE');
    });
  });

  // ==========================================================================
  // 31–38: RECONNECT, CONCURRENCY, PROJECTION SAFETY & INTEGRITY
  // ==========================================================================
  describe('31-38. Reconnect, Concurrency & Security', () => {
    it('31. preserves player state and masks secret on reconnect', () => {
      const engine = new AtrashGameEngine({ testSeed: 123 });
      engine.setParticipants(createFivePlayers());
      engine.startGame();

      const atrashId = engine.internalState.atrashUserId!;
      engine.handleParticipantDisconnect(atrashId);

      assert.equal(
        engine.internalState.participants.find((p) => p.userId === atrashId)?.isConnected,
        false,
      );

      engine.handleParticipantReconnect(atrashId);
      assert.equal(
        engine.internalState.participants.find((p) => p.userId === atrashId)?.isConnected,
        true,
      );

      // Verify projection to reconnected Atrash STILL does not leak secret
      const reconnectedProj = engine.getPlayerProjection(atrashId);
      assert.equal(reconnectedProj.role, 'ATRASH');
      assert.equal(reconnectedProj.secretWord, undefined);
    });

    it('32. rejects stale / out-of-order action submissions', () => {
      const engine = new AtrashGameEngine();
      engine.setParticipants(createFivePlayers());
      engine.startGame();

      // Submit answer when expecting question
      assert.throws(
        () => engine.submitAnswer('u2', 'جواب سابق'),
        (err: any) => err instanceof AtrashEngineError && err.code === AtrashErrorCodes.INVALID_TURN_STAGE,
      );
    });

    it('33. guarantees action idempotency on repeat vote attempts', () => {
      const engine = new AtrashGameEngine();
      engine.setParticipants(createFivePlayers());
      engine.startGame();
      engine.internalState.phase = 'DISCUSSION_PHASE';
      engine.advanceFromDiscussionToVoting();

      engine.castVote('u1', 'u2');
      assert.throws(
        () => engine.castVote('u1', 'u2'),
        (err: any) => err instanceof AtrashEngineError && err.code === AtrashErrorCodes.ALREADY_VOTED,
      );
    });

    it('34. rejects invalid state machine transitions', () => {
      const engine = new AtrashGameEngine();
      engine.setParticipants(createFivePlayers());
      // LOBBY -> cannot advanceToDiscussion
      assert.throws(
        () => engine.advanceFromDiscussionToVoting(),
        (err: any) => err instanceof AtrashEngineError && err.code === AtrashErrorCodes.INVALID_PHASE_TRANSITION,
      );
    });

    it('35. enforces server-owned timer deadlines', () => {
      const engine = new AtrashGameEngine({ turnTimerSeconds: 20 });
      engine.setParticipants(createFivePlayers());
      const now = 5_000_000;
      engine.startGame(now);

      assert.equal(engine.internalState.turnDeadline, now + 20_000);
    });

    it('36. guarantees secret word is absent from public projection in all active phases', () => {
      const engine = new AtrashGameEngine();
      engine.setParticipants(createFivePlayers());
      engine.startGame();

      const activePhases = ['QUESTION_PHASE', 'DISCUSSION_PHASE', 'VOTING', 'VOTE_REVEAL', 'ATRASH_LAST_CHANCE'] as const;

      for (const phase of activePhases) {
        engine.internalState.phase = phase;
        const pub = engine.getPublicProjection();
        const json = JSON.stringify(pub);
        const secret = engine.internalState.secretItem!.word;
        assert.ok(!json.includes(`"secretWord":"${secret}"`), `Secret leaked in ${phase}`);
      }
    });

    it('37. guarantees secret is not leaked after reconnect during last-chance phase', () => {
      const engine = new AtrashGameEngine();
      engine.setParticipants(createFivePlayers());
      engine.startGame();

      const atrashId = engine.internalState.atrashUserId!;
      engine.internalState.phase = 'VOTE_REVEAL';
      engine.startLastChance();

      // Disconnect and reconnect
      engine.handleParticipantDisconnect(atrashId);
      engine.handleParticipantReconnect(atrashId);

      const proj = engine.getPlayerProjection(atrashId);
      // Options are 4 choices, secretWord is still undefined!
      assert.equal(proj.secretWord, undefined);
      assert.equal(proj.lastChanceOptions?.length, 4);
    });

    it('38. rejects participant identity spoofing (non-member action rejection)', () => {
      const engine = new AtrashGameEngine();
      engine.setParticipants(createFivePlayers());
      engine.startGame();

      // Imposter tries to ask question
      assert.throws(
        () => engine.submitQuestion('hacker_99', 'سؤال مزور'),
        (err: any) => err instanceof AtrashEngineError && err.code === AtrashErrorCodes.NOT_YOUR_TURN,
      );

      // Imposter tries to vote
      engine.internalState.phase = 'DISCUSSION_PHASE';
      engine.advanceFromDiscussionToVoting();
      assert.throws(
        () => engine.castVote('hacker_99', 'u1'),
        (err: any) => err instanceof AtrashEngineError && err.code === AtrashErrorCodes.NOT_YOUR_TURN,
      );
    });
  });
});
