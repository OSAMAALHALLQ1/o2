import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';
import * as path from 'path';
import { STARTER_COMPANIONS } from '../prisma/seed.ts';
import { PasswordUtil } from '../src/auth/crypto/password.util.ts';

describe('Phase 2 PostgreSQL Concurrency & Database Engine Integrity', () => {
  let db: PGlite;

  before(async () => {
    db = new PGlite();

    // Read and execute official Phase 2 migration SQL on real PostgreSQL engine
    const migrationSqlPath = path.resolve(
      process.cwd(),
      'prisma/migrations/20260827171500_phase2_identity_auth_onboarding/migration.sql',
    );
    const sql = fs.readFileSync(migrationSqlPath, 'utf8');
    await db.exec(sql);

    // Seed characters in PostgreSQL database
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

  describe('1. Real PostgreSQL Refresh Token Double-Use Race', () => {
    it('should enforce that two concurrent refresh requests on the same token result in exactly 1 success and 1 replay detection at PostgreSQL row level', async () => {
      // 1. Setup user, session, and initial token T0
      const userId = 'usr_pg_01';
      const sessionId = 'sess_pg_01';
      const familyId = 'fam_pg_01';
      const tokenT0 = 'o2_rt_token_T0_concurrency_test';
      const tokenT0Hash = PasswordUtil.hashRefreshToken(tokenT0);

      await db.query(
        `INSERT INTO "users" ("id", "role", "moderationStatus", "createdAt", "updatedAt") VALUES ($1, 'PLAYER', 'ACTIVE', NOW(), NOW())`,
        [userId],
      );
      await db.query(
        `INSERT INTO "user_sessions" ("id", "userId", "familyId", "expiresAt", "createdAt") VALUES ($1, $2, $3, NOW() + INTERVAL '30 days', NOW())`,
        [sessionId, userId, familyId],
      );
      await db.query(
        `INSERT INTO "refresh_token_records" ("id", "sessionId", "familyId", "tokenHash", "expiresAt", "createdAt") VALUES ($1, $2, $3, $4, NOW() + INTERVAL '30 days', NOW())`,
        ['rt_rec_01', sessionId, familyId, tokenT0Hash],
      );

      // Atomic PostgreSQL rotation handler using conditional UPDATE
      const attemptRotateInPostgres = async (rawToken: string, newToken: string, newRecordId: string) => {
        const hash = PasswordUtil.hashRefreshToken(rawToken);
        const newHash = PasswordUtil.hashRefreshToken(newToken);

        // Step A: Atomic conditional consume
        const consumeResult = await db.query(
          `UPDATE "refresh_token_records"
           SET "consumedAt" = NOW()
           WHERE "tokenHash" = $1 AND "consumedAt" IS NULL AND "revokedAt" IS NULL
           RETURNING "id", "sessionId", "familyId"`,
          [hash],
        );

        if (consumeResult.rows.length === 0) {
          // Double-use / Replay triggered: Revoke family
          const existing = await db.query(
            `SELECT "familyId" FROM "refresh_token_records" WHERE "tokenHash" = $1`,
            [hash],
          );
          if (existing.rows.length > 0) {
            const fam = (existing.rows[0] as any).familyId;
            await db.query(
              `UPDATE "refresh_token_records" SET "revokedAt" = NOW() WHERE "familyId" = $1`,
              [fam],
            );
            await db.query(
              `UPDATE "user_sessions" SET "revokedAt" = NOW() WHERE "familyId" = $1`,
              [fam],
            );
          }
          return { success: false, error: 'SECURITY_ALERT_REPLAY_DETECTED' };
        }

        const row = consumeResult.rows[0] as any;

        // Step B: Insert child token
        await db.query(
          `INSERT INTO "refresh_token_records" ("id", "sessionId", "familyId", "tokenHash", "expiresAt", "createdAt")
           VALUES ($1, $2, $3, $4, NOW() + INTERVAL '30 days', NOW())`,
          [newRecordId, row.sessionId, row.familyId, newHash],
        );

        // Step C: Link replacedByTokenId
        await db.query(
          `UPDATE "refresh_token_records" SET "replacedByTokenId" = $1 WHERE "id" = $2`,
          [newRecordId, row.id],
        );

        return { success: true, newRecordId };
      };

      // Execute simultaneous race: Req 1 and Req 2 both attempt to rotate tokenT0
      const [res1, res2] = await Promise.all([
        attemptRotateInPostgres(tokenT0, 'token_T1_req1', 'rt_rec_02_a'),
        attemptRotateInPostgres(tokenT0, 'token_T1_req2', 'rt_rec_02_b'),
      ]);

      const successes = [res1, res2].filter((r) => r.success);
      const failures = [res1, res2].filter((r) => !r.success);

      assert.equal(successes.length, 1, 'Exactly ONE concurrent rotation must succeed in PostgreSQL');
      assert.equal(failures.length, 1, 'Exactly ONE concurrent rotation must fail in PostgreSQL');
      assert.equal(failures[0].error, 'SECURITY_ALERT_REPLAY_DETECTED');

      // Verify PostgreSQL DB state: only ONE child record was inserted before family revocation
      const tokens = await db.query(`SELECT * FROM "refresh_token_records" WHERE "sessionId" = $1`, [sessionId]);
      assert.equal(tokens.rows.length, 2, 'Initial token + exactly 1 child token in database');
    });
  });

  describe('2. Real PostgreSQL Permanent Companion Selection Race', () => {
    it('should enforce that two concurrent companion selections for the same profile result in exactly 1 success and 1 conflict', async () => {
      const userId = 'usr_pg_companion_race';
      await db.query(
        `INSERT INTO "users" ("id", "role", "moderationStatus", "createdAt", "updatedAt") VALUES ($1, 'PLAYER', 'ACTIVE', NOW(), NOW())`,
        [userId],
      );
      await db.query(
        `INSERT INTO "player_profiles" ("id", "userId", "username", "normalizedUsername", "language", "selectedCharacterId", "isOnboarded", "createdAt", "updatedAt")
         VALUES ($1, $2, 'race_player', 'race_player', 'ar', NULL, false, NOW(), NOW())`,
        ['prof_race_01', userId],
      );

      // Atomic PostgreSQL companion selection handler
      const selectCompanionAtomic = async (uid: string, characterId: string) => {
        const updateResult = await db.query(
          `UPDATE "player_profiles"
           SET "selectedCharacterId" = $1,
               "isOnboarded" = CASE WHEN "username" IS NOT NULL THEN true ELSE false END,
               "updatedAt" = NOW()
           WHERE "userId" = $2 AND "selectedCharacterId" IS NULL
           RETURNING "id", "selectedCharacterId", "isOnboarded"`,
          [characterId, uid],
        );

        if (updateResult.rows.length === 0) {
          return { success: false, error: 'COMPANION_ALREADY_CHOSEN' };
        }

        return { success: true, profile: updateResult.rows[0] };
      };

      const [res1, res2] = await Promise.all([
        selectCompanionAtomic(userId, 'char_starter_01'),
        selectCompanionAtomic(userId, 'char_starter_02'),
      ]);

      const successes = [res1, res2].filter((r) => r.success);
      const conflicts = [res1, res2].filter((r) => !r.success);

      assert.equal(successes.length, 1, 'Exactly ONE concurrent companion selection must succeed');
      assert.equal(conflicts.length, 1, 'Exactly ONE concurrent companion selection must conflict');
      assert.equal(conflicts[0].error, 'COMPANION_ALREADY_CHOSEN');

      // Verify PostgreSQL profile row has single immutable companion and isOnboarded is true
      const checkProfile = await db.query(
        `SELECT "selectedCharacterId", "isOnboarded" FROM "player_profiles" WHERE "userId" = $1`,
        [userId],
      );
      const row = checkProfile.rows[0] as any;
      assert.ok(row.selectedCharacterId !== null);
      assert.equal(row.isOnboarded, true);
    });
  });

  describe('3. Real PostgreSQL Username Uniqueness & Concurrent Claim Race', () => {
    it('should reject simultaneous claim of identical normalized username with PostgreSQL unique constraint code 23505', async () => {
      const u1 = 'usr_pg_handle_1';
      const u2 = 'usr_pg_handle_2';

      await db.query(
        `INSERT INTO "users" ("id", "role", "moderationStatus", "createdAt", "updatedAt") VALUES ($1, 'PLAYER', 'ACTIVE', NOW(), NOW()), ($2, 'PLAYER', 'ACTIVE', NOW(), NOW())`,
        [u1, u2],
      );

      const claimHandleInPostgres = async (userId: string, handle: string) => {
        const normalized = handle.trim().toLowerCase();
        try {
          await db.query(
            `INSERT INTO "player_profiles" ("id", "userId", "username", "normalizedUsername", "language", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, 'ar', NOW(), NOW())`,
            [`prof_${userId}`, userId, handle.trim(), normalized],
          );
          return { success: true };
        } catch (err: any) {
          return { success: false, code: err.code || err.message };
        }
      };

      const [resA, resB] = await Promise.all([
        claimHandleInPostgres(u1, 'Anas_O2'),
        claimHandleInPostgres(u2, 'anas_o2'),
      ]);

      const successes = [resA, resB].filter((r) => r.success);
      const failures = [resA, resB].filter((r) => !r.success);

      assert.equal(successes.length, 1, 'Exactly 1 username claim must succeed');
      assert.equal(failures.length, 1, 'Duplicate normalized claim must trigger unique violation');
      assert.ok(
        failures[0].code.includes('23505') || failures[0].code.includes('unique') || failures[0].code.includes('player_profiles_normalizedUsername_key'),
        'PostgreSQL must reject duplicate normalized handle',
      );
    });
  });

  describe('4. Real PostgreSQL Seed Validation', () => {
    it('should verify all 20 starter companions exist in PostgreSQL characters table', async () => {
      const res = await db.query(`SELECT COUNT(*)::int as count FROM "characters" WHERE "isStarter" = true AND "isActive" = true`);
      const count = (res.rows[0] as any).count;
      assert.equal(count, 20, 'PostgreSQL database must contain exactly 20 active starter companions');
    });
  });
});
