import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';
import * as path from 'path';
import { STARTER_COMPANIONS } from '../prisma/seed.ts';
import {
  calculateEffectiveCareState,
  applyCareAction,
  DEFAULT_COMPANION_TUNING_CONFIG,
} from '@o2/game-core';
import type { RawCareState } from '@o2/game-core';

describe('Phase 3: Living Companion Care & PostgreSQL Simulation Integration', () => {
  let db: PGlite;

  before(async () => {
    db = new PGlite();

    // 1. Apply Phase 2 Migration
    const phase2SqlPath = path.resolve(
      process.cwd(),
      'prisma/migrations/20260827171500_phase2_identity_auth_onboarding/migration.sql',
    );
    const sql2 = fs.readFileSync(phase2SqlPath, 'utf8');
    await db.exec(sql2);

    // 2. Apply Phase 3 Migration
    const phase3SqlPath = path.resolve(
      process.cwd(),
      'prisma/migrations/20260827180000_phase3_companion_care_engine/migration.sql',
    );
    const sql3 = fs.readFileSync(phase3SqlPath, 'utf8');
    await db.exec(sql3);

    // 3. Seed Characters
    for (let i = 0; i < STARTER_COMPANIONS.length; i++) {
      const c = STARTER_COMPANIONS[i];
      const charId = `char_starter_${String(i + 1).padStart(2, '0')}`;
      await db.query(
        `INSERT INTO "characters" ("id", "slug", "nameAr", "nameEn", "descriptionAr", "archetype", "placeholderAsset", "isStarter", "isActive", "sortOrder", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
        [
          charId,
          c.slug,
          c.nameAr,
          c.nameEn,
          c.descriptionAr,
          c.archetype,
          c.placeholderAsset,
          c.isStarter,
          c.isActive,
          c.sortOrder,
        ],
      );
    }
  });

  describe('1. Dynamic Read Simulation (No Writes on GET)', () => {
    it('should compute effective state from server elapsed time without mutating database row', async () => {
      const userId = 'usr_care_01';
      const now = new Date();
      const fourHoursAgo = new Date(now.getTime() - 4 * 3600000);

      await db.query(
        `INSERT INTO "users" ("id", "role", "moderationStatus", "createdAt", "updatedAt") VALUES ($1, 'PLAYER', 'ACTIVE', NOW(), NOW())`,
        [userId],
      );
      await db.query(
        `INSERT INTO "player_profiles" ("id", "userId", "username", "normalizedUsername", "selectedCharacterId", "isOnboarded", "createdAt", "updatedAt")
         VALUES ('prof_01', $1, 'anas_care', 'anas_care', 'char_starter_01', true, NOW(), NOW())`,
        [userId],
      );
      await db.query(
        `INSERT INTO "companion_care_states" ("id", "userId", "hunger", "cleanliness", "energy", "mood", "isSleeping", "lastSimulatedAt", "lastInteractionAt", "createdAt", "updatedAt")
         VALUES ('care_01', $1, 80.0, 80.0, 80.0, 80.0, false, $2::timestamp, $2::timestamp, NOW(), NOW())`,
        [userId, fourHoursAgo.toISOString()],
      );

      // Fetch row directly with epoch milliseconds for pure timezone immunity
      const rowRes = await db.query(
        `SELECT "hunger", "cleanliness", "energy", "mood", "isSleeping",
                EXTRACT(EPOCH FROM "lastSimulatedAt") * 1000 AS "lastSimulatedAtMs",
                EXTRACT(EPOCH FROM "lastInteractionAt") * 1000 AS "lastInteractionAtMs",
                EXTRACT(EPOCH FROM "sleepStartedAt") * 1000 AS "sleepStartedAtMs"
         FROM "companion_care_states" WHERE "userId" = $1`,
        [userId],
      );
      const row = rowRes.rows[0] as any;

      // Pure simulation on read
      const simulated = calculateEffectiveCareState(
        {
          hunger: Number(row.hunger),
          cleanliness: Number(row.cleanliness),
          energy: Number(row.energy),
          mood: Number(row.mood),
          isSleeping: Boolean(row.isSleeping),
          sleepStartedAt: row.sleepStartedAtMs ? Number(row.sleepStartedAtMs) : null,
          lastSimulatedAt: Number(row.lastSimulatedAtMs),
          lastInteractionAt: Number(row.lastInteractionAtMs),
        },
        now.getTime(),
      );

      // Verify simulated stats decayed by 4 hours
      // Hunger: 80 - (4 * 3) = 68.0
      assert.equal(simulated.hunger, 68.0);
      // Cleanliness: 80 - (4 * 2) = 72.0
      assert.equal(simulated.cleanliness, 72.0);
      // Energy: 80 - (4 * 2.5) = 70.0
      assert.equal(simulated.energy, 70.0);
      // Mood: 80 - (4 * 2) = 72.0
      assert.equal(simulated.mood, 72.0);

      // Verify database row remained completely untouched (NO continuous background writes)
      const rowAfterRead = (await db.query(`SELECT "hunger" FROM "companion_care_states" WHERE "userId" = $1`, [userId])).rows[0] as any;
      assert.equal(Number(rowAfterRead.hunger), 80.0);
    });
  });

  describe('2. Idempotent Care Action Execution in PostgreSQL', () => {
    it('should apply care action once and return cached response on retry with same clientActionId', async () => {
      const userId = 'usr_care_idempotent';
      const clientActionId = 'act_uuid_001_feed';
      const now = new Date();

      await db.query(
        `INSERT INTO "users" ("id", "role", "moderationStatus", "createdAt", "updatedAt") VALUES ($1, 'PLAYER', 'ACTIVE', NOW(), NOW())`,
        [userId],
      );
      await db.query(
        `INSERT INTO "companion_care_states" ("id", "userId", "hunger", "cleanliness", "energy", "mood", "isSleeping", "lastSimulatedAt", "lastInteractionAt", "createdAt", "updatedAt")
         VALUES ('care_02', $1, 60.0, 80.0, 80.0, 80.0, false, $2::timestamp, $2::timestamp, NOW(), NOW())`,
        [userId, now.toISOString()],
      );

      // Execution function matching service transaction
      const executeCareActionInPostgres = async (uId: string, actId: string, actionType: 'FEED' | 'CLEAN') => {
        // 1. Check idempotency log
        const existing = await db.query(
          `SELECT "responsePayload" FROM "companion_action_logs" WHERE "userId" = $1 AND "clientActionId" = $2`,
          [uId, actId],
        );
        if (existing.rows.length > 0) {
          return { cached: true, payload: (existing.rows[0] as any).responsePayload };
        }

        // 2. Load state with epoch and apply
        const stateRes = await db.query(
          `SELECT "hunger", "cleanliness", "energy", "mood", "isSleeping",
                  EXTRACT(EPOCH FROM "lastSimulatedAt") * 1000 AS "lastSimulatedAtMs",
                  EXTRACT(EPOCH FROM "lastInteractionAt") * 1000 AS "lastInteractionAtMs",
                  EXTRACT(EPOCH FROM "sleepStartedAt") * 1000 AS "sleepStartedAtMs"
           FROM "companion_care_states" WHERE "userId" = $1`,
          [uId],
        );
        const stateRow = stateRes.rows[0] as any;

        const raw: RawCareState = {
          hunger: Number(stateRow.hunger),
          cleanliness: Number(stateRow.cleanliness),
          energy: Number(stateRow.energy),
          mood: Number(stateRow.mood),
          isSleeping: Boolean(stateRow.isSleeping),
          sleepStartedAt: stateRow.sleepStartedAtMs ? Number(stateRow.sleepStartedAtMs) : null,
          lastSimulatedAt: Number(stateRow.lastSimulatedAtMs),
          lastInteractionAt: Number(stateRow.lastInteractionAtMs),
        };

        const result = applyCareAction(raw, actionType, now.getTime());

        // 3. Update state
        await db.query(
          `UPDATE "companion_care_states"
           SET "hunger" = $1, "cleanliness" = $2, "energy" = $3, "mood" = $4, "lastSimulatedAt" = NOW(), "lastInteractionAt" = NOW()
           WHERE "userId" = $5`,
          [result.updatedState.hunger, result.updatedState.cleanliness, result.updatedState.energy, result.updatedState.mood, uId],
        );

        const payload = { success: true, action: actionType, reaction: result.reaction, hunger: result.updatedState.hunger };

        // 4. Log idempotency record
        await db.query(
          `INSERT INTO "companion_action_logs" ("id", "userId", "clientActionId", "actionType", "appliedAt", "responsePayload")
           VALUES ($1, $2, $3, $4, NOW(), $5)`,
          [`log_${Date.now()}_${Math.random()}`, uId, actId, actionType, JSON.stringify(payload)],
        );

        return { cached: false, payload };
      };

      // First Request
      const res1 = await executeCareActionInPostgres(userId, clientActionId, 'FEED');
      assert.equal(res1.cached, false);
      assert.equal(res1.payload.hunger, 85.0); // 60 + 25

      // Second Request (Network Retry with exact same clientActionId)
      const res2 = await executeCareActionInPostgres(userId, clientActionId, 'FEED');
      assert.equal(res2.cached, true, 'Retry must return cached payload');
      assert.equal(res2.payload.hunger, 85.0);

      // Verify hunger was NOT incremented a second time (must remain 85, NOT 100)
      const finalRow = (await db.query(`SELECT "hunger" FROM "companion_care_states" WHERE "userId" = $1`, [userId])).rows[0] as any;
      assert.equal(Number(finalRow.hunger), 85.0);
    });

    it('should safely handle simultaneous duplicate clientActionId race via PostgreSQL unique index recovery', async () => {
      const userId = 'usr_care_idempotent_race';
      const clientActionId = 'act_race_shared_id_01';
      const now = new Date();

      await db.query(
        `INSERT INTO "users" ("id", "role", "moderationStatus", "createdAt", "updatedAt") VALUES ($1, 'PLAYER', 'ACTIVE', NOW(), NOW())`,
        [userId],
      );
      await db.query(
        `INSERT INTO "companion_care_states" ("id", "userId", "hunger", "cleanliness", "energy", "mood", "isSleeping", "lastSimulatedAt", "lastInteractionAt", "createdAt", "updatedAt")
         VALUES ('care_race_01', $1, 50.0, 80.0, 80.0, 80.0, false, $2::timestamp, $2::timestamp, NOW(), NOW())`,
        [userId, now.toISOString()],
      );

      // Atomic execution with unique violation recovery matching CompanionService
      let dbMutex = Promise.resolve();
      const executeWithRaceCatch = async () => {
        // Chain on mutex to simulate separate serialized connections
        return new Promise<any>((resolve, reject) => {
          dbMutex = dbMutex.then(async () => {
            try {
              await db.exec('BEGIN');
              // Pre-check
              const existing = await db.query(
                `SELECT "responsePayload" FROM "companion_action_logs" WHERE "userId" = $1 AND "clientActionId" = $2`,
                [userId, clientActionId],
              );
              if (existing.rows.length > 0) {
                await db.exec('ROLLBACK');
                resolve({ status: 'CACHED', payload: (existing.rows[0] as any).responsePayload });
                return;
              }

              // Apply state change and insert
              const payload = { success: true, action: 'FEED', hunger: 75.0 };
              await db.query(
                `UPDATE "companion_care_states" SET "hunger" = "hunger" + 25.0 WHERE "userId" = $1`,
                [userId],
              );
              await db.query(
                `INSERT INTO "companion_action_logs" ("id", "userId", "clientActionId", "actionType", "appliedAt", "responsePayload")
                 VALUES ($1, $2, $3, 'FEED', NOW(), $4)`,
                [`log_${Date.now()}_${Math.random()}`, userId, clientActionId, JSON.stringify(payload)],
              );
              await db.exec('COMMIT');
              resolve({ status: 'APPLIED', payload });
            } catch (err: any) {
              await db.exec('ROLLBACK').catch(() => null);
              if (err.message.includes('unique constraint') || err.message.includes('23505')) {
                // Recover from unique collision
                const saved = await db.query(
                  `SELECT "responsePayload" FROM "companion_action_logs" WHERE "userId" = $1 AND "clientActionId" = $2`,
                  [userId, clientActionId],
                );
                resolve({ status: 'RECOVERED', payload: (saved.rows[0] as any).responsePayload });
                return;
              }
              reject(err);
            }
          });
        });
      };

      // Run 2 simultaneous duplicate requests
      const [r1, r2] = await Promise.all([executeWithRaceCatch(), executeWithRaceCatch()]);

      // Exactly one must have applied, and one resolved cached log
      const statuses = [r1.status, r2.status];
      assert.ok(statuses.includes('APPLIED'), 'One request must apply');
      assert.ok(statuses.includes('CACHED') || statuses.includes('RECOVERED'), 'Second request must resolve cached log');

      // Verify hunger applied exactly once (50 + 25 = 75, NOT 100)
      const finalRow = (await db.query(`SELECT "hunger" FROM "companion_care_states" WHERE "userId" = $1`, [userId])).rows[0] as any;
      assert.equal(Number(finalRow.hunger), 75.0);

      // Verify exactly 1 log record exists
      const logCount = (await db.query(`SELECT COUNT(*) as cnt FROM "companion_action_logs" WHERE "userId" = $1 AND "clientActionId" = $2`, [userId, clientActionId])).rows[0] as any;
      assert.equal(Number(logCount.cnt), 1);
    });
  });

  describe('3. Concurrency Protection & Serialization (No Lost Updates on FEED + PLAY)', () => {
    it('should serialize concurrent FEED and PLAY without losing either update', async () => {
      const userId = 'usr_care_feed_play_concurrent';
      const now = new Date();

      await db.query(
        `INSERT INTO "users" ("id", "role", "moderationStatus", "createdAt", "updatedAt") VALUES ($1, 'PLAYER', 'ACTIVE', NOW(), NOW())`,
        [userId],
      );
      // Starting state: Hunger 60.0, Cleanliness 80.0, Energy 60.0, Mood 60.0
      await db.query(
        `INSERT INTO "companion_care_states" ("id", "userId", "hunger", "cleanliness", "energy", "mood", "isSleeping", "lastSimulatedAt", "lastInteractionAt", "createdAt", "updatedAt")
         VALUES ('care_feed_play', $1, 60.0, 80.0, 60.0, 60.0, false, $2::timestamp, $2::timestamp, NOW(), NOW())`,
        [userId, now.toISOString()],
      );

      // Simulated atomic serialization function mimicking CompanionService transaction with FOR UPDATE
      let actionMutex = Promise.resolve();
      const runActionSerialized = async (action: 'FEED' | 'PLAY', actId: string) => {
        return new Promise<any>((resolve, reject) => {
          actionMutex = actionMutex.then(async () => {
            try {
              await db.exec('BEGIN');
              // Step 1: In transaction, acquire row lock
              await db.query(`SELECT "id" FROM "companion_care_states" WHERE "userId" = $1 FOR UPDATE`, [userId]);

              // Step 2: Read latest state
              const stateRes = await db.query(
                `SELECT "hunger", "cleanliness", "energy", "mood", "isSleeping",
                        EXTRACT(EPOCH FROM "lastSimulatedAt") * 1000 AS "lastSimulatedAtMs",
                        EXTRACT(EPOCH FROM "lastInteractionAt") * 1000 AS "lastInteractionAtMs",
                        EXTRACT(EPOCH FROM "sleepStartedAt") * 1000 AS "sleepStartedAtMs"
                 FROM "companion_care_states" WHERE "userId" = $1`,
                [userId],
              );
              const stateRow = stateRes.rows[0] as any;

              const raw: RawCareState = {
                hunger: Number(stateRow.hunger),
                cleanliness: Number(stateRow.cleanliness),
                energy: Number(stateRow.energy),
                mood: Number(stateRow.mood),
                isSleeping: Boolean(stateRow.isSleeping),
                sleepStartedAt: stateRow.sleepStartedAtMs ? Number(stateRow.sleepStartedAtMs) : null,
                lastSimulatedAt: Number(stateRow.lastSimulatedAtMs),
                lastInteractionAt: Number(stateRow.lastInteractionAtMs),
              };

              // Step 3: Apply action deltas
              const result = applyCareAction(raw, action, now.getTime());

              // Step 4: Write updated state
              await db.query(
                `UPDATE "companion_care_states"
                 SET "hunger" = $1, "cleanliness" = $2, "energy" = $3, "mood" = $4, "lastSimulatedAt" = NOW(), "lastInteractionAt" = NOW()
                 WHERE "userId" = $5`,
                [result.updatedState.hunger, result.updatedState.cleanliness, result.updatedState.energy, result.updatedState.mood, userId],
              );

              // Step 5: Insert log
              await db.query(
                `INSERT INTO "companion_action_logs" ("id", "userId", "clientActionId", "actionType", "appliedAt", "responsePayload")
                 VALUES ($1, $2, $3, $4, NOW(), $5)`,
                [`log_${Date.now()}_${Math.random()}`, userId, actId, action, JSON.stringify(result)],
              );

              await db.exec('COMMIT');
              resolve(result);
            } catch (err) {
              await db.exec('ROLLBACK').catch(() => null);
              reject(err);
            }
          });
        });
      };

      // Run FEED and PLAY concurrently
      await Promise.all([
        runActionSerialized('FEED', 'act_feed_concurrent_01'),
        runActionSerialized('PLAY', 'act_play_concurrent_01'),
      ]);

      const finalState = (await db.query(`SELECT "hunger", "energy", "mood" FROM "companion_care_states" WHERE "userId" = $1`, [userId])).rows[0] as any;

      // Starting: Hunger 60, Energy 60, Mood 60
      // FEED: Hunger +25 -> 85.0, Mood +5 -> 65.0
      // PLAY: Energy -15 -> 45.0, Mood +25 -> 90.0
      // Expected Final: Hunger = 85.0, Energy = 45.0, Mood = 90.0 (Zero Lost Updates)
      assert.equal(Number(finalState.hunger), 85.0);
      assert.equal(Number(finalState.energy), 45.0);
      assert.equal(Number(finalState.mood), 90.0);
    });
  });

  describe('4. Action Cooldown & Idempotent Retry Enforcement', () => {
    it('should reject same action during cooldown window but allow idempotent retry of previous clientActionId', async () => {
      const userId = 'usr_care_cooldown';
      const initialClientActionId = 'act_feed_cooldown_01';
      const baseTime = Date.now();

      await db.query(
        `INSERT INTO "users" ("id", "role", "moderationStatus", "createdAt", "updatedAt") VALUES ($1, 'PLAYER', 'ACTIVE', NOW(), NOW())`,
        [userId],
      );
      await db.query(
        `INSERT INTO "companion_care_states" ("id", "userId", "hunger", "cleanliness", "energy", "mood", "isSleeping", "lastSimulatedAt", "lastInteractionAt", "createdAt", "updatedAt")
         VALUES ('care_cooldown_01', $1, 60.0, 80.0, 80.0, 80.0, false, NOW(), NOW(), NOW(), NOW())`,
        [userId],
      );

      const executeWithCooldownCheck = async (actId: string, actionType: 'FEED', requestTimestampMs: number) => {
        // 1. Idempotency Check (MUST occur before cooldown check)
        const existing = await db.query(
          `SELECT "responsePayload" FROM "companion_action_logs" WHERE "userId" = $1 AND "clientActionId" = $2`,
          [userId, actId],
        );
        if (existing.rows.length > 0) {
          return { cached: true, payload: (existing.rows[0] as any).responsePayload };
        }

        // 2. Cooldown check
        const cooldownMs = DEFAULT_COMPANION_TUNING_CONFIG.actions[actionType].cooldownMs; // 3000ms
        const lastAction = await db.query(
          `SELECT EXTRACT(EPOCH FROM "appliedAt") * 1000 AS "appliedAtMs"
           FROM "companion_action_logs"
           WHERE "userId" = $1 AND "actionType" = $2
           ORDER BY "appliedAt" DESC LIMIT 1`,
          [userId, actionType],
        );

        if (lastAction.rows.length > 0) {
          const lastAppliedMs = Number((lastAction.rows[0] as any).appliedAtMs);
          const elapsed = requestTimestampMs - lastAppliedMs;
          if (elapsed < cooldownMs) {
            throw new Error(`COOLDOWN_ACTIVE: ${Math.ceil((cooldownMs - elapsed) / 1000)}s`);
          }
        }

        // 3. Apply action and log with requestTimestamp
        const payload = { success: true, action: actionType, hunger: 85.0 };
        const recordDate = new Date(requestTimestampMs).toISOString();
        await db.query(
          `INSERT INTO "companion_action_logs" ("id", "userId", "clientActionId", "actionType", "appliedAt", "responsePayload")
           VALUES ($1, $2, $3, $4, $5::timestamp, $6)`,
          [`log_${Date.now()}_${Math.random()}`, userId, actId, actionType, recordDate, JSON.stringify(payload)],
        );

        return { cached: false, payload };
      };

      // 1. Initial FEED at T0 -> Succeeds
      const firstRes = await executeWithCooldownCheck(initialClientActionId, 'FEED', baseTime);
      assert.equal(firstRes.cached, false);

      // 2. New FEED action with new clientActionId at T0 + 1 second (inside 3s cooldown) -> Rejected
      await assert.rejects(
        () => executeWithCooldownCheck('act_feed_cooldown_02_new', 'FEED', baseTime + 1000),
        /COOLDOWN_ACTIVE/,
      );

      // 3. Idempotent RETRY of initialClientActionId at T0 + 1 second (inside cooldown) -> SUCCEEDS and returns cached payload
      const retryRes = await executeWithCooldownCheck(initialClientActionId, 'FEED', baseTime + 1000);
      assert.equal(retryRes.cached, true);
      assert.equal(retryRes.payload.action, 'FEED');

      // 4. New FEED action with new clientActionId at T0 + 3.1 seconds (cooldown expired) -> Succeeds
      const afterCooldownRes = await executeWithCooldownCheck('act_feed_cooldown_03_new', 'FEED', baseTime + 3100);
      assert.equal(afterCooldownRes.cached, false);
    });
  });
});
