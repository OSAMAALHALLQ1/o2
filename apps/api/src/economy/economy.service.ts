import {
  Injectable,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CurrencyKind,
  CurrencyScopeType,
  CurrencyLedgerSource,
  EconomyOverviewDto,
  CurrencyLedgerEntryDto,
} from '@o2/types';
import {
  validateCurrencyScope,
  validateIntegerAmount,
  hashEconomyRequest,
  EconomyErrorCodes,
} from '@o2/game-core';

export interface CreditOptions {
  scopeType?: CurrencyScopeType | null;
  scopeId?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
  requestFingerprint?: string;
}

export interface DebitOptions {
  scopeType?: CurrencyScopeType | null;
  scopeId?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
  requestFingerprint?: string;
}

@Injectable()
export class EconomyService {
  private readonly logger = new Logger(EconomyService.name);
  public static readonly WELCOME_COINS = BigInt(500);
  private static readonly MAX_SAFE_BALANCE = BigInt(Number.MAX_SAFE_INTEGER);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Internal trusted credit function.
   * Atomically locks/creates currency account, validates scope, calculates new balance,
   * inserts append-only ledger entry, and commits.
   */
  async creditCurrency(
    userId: string,
    currencyKind: CurrencyKind,
    amount: bigint | number,
    sourceType: CurrencyLedgerSource,
    idempotencyKey: string,
    options: CreditOptions = {},
  ) {
    const numericAmount = typeof amount === 'bigint' ? Number(amount) : amount;
    const amountBigInt = typeof amount === 'bigint' ? amount : BigInt(amount);

    const intVal = validateIntegerAmount(numericAmount);
    if (!intVal.isValid) {
      throw new BadRequestException({ code: EconomyErrorCodes.INVALID_AMOUNT, message: intVal.error });
    }

    const scopeVal = validateCurrencyScope({
      currencyKind,
      scopeType: options.scopeType,
      scopeId: options.scopeId,
    });
    if (!scopeVal.isValid) {
      throw new BadRequestException({ code: EconomyErrorCodes.INVALID_CURRENCY_SCOPE, message: scopeVal.error });
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Step 1: Idempotency pre-check
        const existingEntry = await tx.currencyLedgerEntry.findUnique({
          where: {
            userId_idempotencyKey: {
              userId,
              idempotencyKey,
            },
          },
        });

        if (existingEntry) {
          this.assertLedgerReplayMatches(existingEntry, currencyKind, 'CREDIT', amountBigInt, sourceType, options);
          return {
            status: 'CACHED' as const,
            entry: existingEntry,
            newBalance: Number(existingEntry.balanceAfter),
          };
        }

        // Lock the always-present user row so creation of an absent account is serialized.
        await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;

        // Step 2: Ensure account exists
        let account = await tx.currencyAccount.findFirst({
          where: {
            userId,
            currencyKind,
            scopeType: options.scopeType ?? null,
            scopeId: options.scopeId ?? null,
          },
        });

        if (!account) {
          account = await tx.currencyAccount.create({
            data: {
              userId,
              currencyKind,
              scopeType: options.scopeType || null,
              scopeId: options.scopeId || null,
              balance: BigInt(0),
            },
          });
        }

        // Step 3: Lock account row
        await tx.$queryRaw`SELECT "id" FROM "currency_accounts" WHERE "id" = ${account.id} FOR UPDATE`;

        // Re-read locked balance
        const lockedAccount = await tx.currencyAccount.findUniqueOrThrow({
          where: { id: account.id },
        });

        const newBalanceBigInt = lockedAccount.balance + amountBigInt;
        if (newBalanceBigInt > EconomyService.MAX_SAFE_BALANCE) {
          throw new BadRequestException({
            code: EconomyErrorCodes.INVALID_AMOUNT,
            message: 'Resulting balance exceeds the supported safe integer range.',
          });
        }

        // Step 4: Insert ledger entry
        const entry = await tx.currencyLedgerEntry.create({
          data: {
            userId,
            currencyKind,
            scopeType: options.scopeType || null,
            scopeId: options.scopeId || null,
            direction: 'CREDIT',
            amount: amountBigInt,
            balanceAfter: newBalanceBigInt,
            sourceType,
            sourceId: options.sourceId || null,
            idempotencyKey,
            requestFingerprint: options.requestFingerprint || null,
            metadata: options.metadata ? JSON.parse(JSON.stringify(options.metadata)) : undefined,
          },
        });

        // Step 5: Update materialized balance
        await tx.currencyAccount.update({
          where: { id: account.id },
          data: { balance: newBalanceBigInt },
        });

        return {
          status: 'APPLIED' as const,
          entry,
          newBalance: Number(newBalanceBigInt),
        };
      });
    } catch (err: any) {
      if (err?.code === 'P2002' || err?.message?.includes('23505')) {
        // Collision resolution on duplicate idempotency key
        const saved = await this.prisma.currencyLedgerEntry.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey } },
        });
        if (saved) {
          this.assertLedgerReplayMatches(saved, currencyKind, 'CREDIT', amountBigInt, sourceType, options);
          return {
            status: 'RECOVERED' as const,
            entry: saved,
            newBalance: Number(saved.balanceAfter),
          };
        }
      }
      throw err;
    }
  }

  /**
   * Internal trusted debit function.
   * Atomically locks account, verifies balance >= debit amount, inserts debit ledger entry,
   * updates materialized balance, and commits.
   */
  async debitCurrency(
    userId: string,
    currencyKind: CurrencyKind,
    amount: bigint | number,
    sourceType: CurrencyLedgerSource,
    idempotencyKey: string,
    options: DebitOptions = {},
  ) {
    const numericAmount = typeof amount === 'bigint' ? Number(amount) : amount;
    const amountBigInt = typeof amount === 'bigint' ? amount : BigInt(amount);

    const intVal = validateIntegerAmount(numericAmount);
    if (!intVal.isValid) {
      throw new BadRequestException({ code: EconomyErrorCodes.INVALID_AMOUNT, message: intVal.error });
    }

    const scopeVal = validateCurrencyScope({
      currencyKind,
      scopeType: options.scopeType,
      scopeId: options.scopeId,
    });
    if (!scopeVal.isValid) {
      throw new BadRequestException({ code: EconomyErrorCodes.INVALID_CURRENCY_SCOPE, message: scopeVal.error });
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Step 1: Idempotency pre-check
        const existingEntry = await tx.currencyLedgerEntry.findUnique({
          where: {
            userId_idempotencyKey: {
              userId,
              idempotencyKey,
            },
          },
        });

        if (existingEntry) {
          this.assertLedgerReplayMatches(existingEntry, currencyKind, 'DEBIT', amountBigInt, sourceType, options);
          return {
            status: 'CACHED' as const,
            entry: existingEntry,
            newBalance: Number(existingEntry.balanceAfter),
          };
        }

        // Step 2: Load account
        const account = await tx.currencyAccount.findFirst({
          where: {
            userId,
            currencyKind,
            scopeType: options.scopeType ?? null,
            scopeId: options.scopeId ?? null,
          },
        });

        if (!account) {
          throw new BadRequestException({
            code: EconomyErrorCodes.INSUFFICIENT_FUNDS,
            message: 'رصيد الحساب غير كافٍ لإتمام العملية.',
          });
        }

        // Step 3: Lock account row
        await tx.$queryRaw`SELECT "id" FROM "currency_accounts" WHERE "id" = ${account.id} FOR UPDATE`;

        // Re-read locked balance
        const lockedAccount = await tx.currencyAccount.findUniqueOrThrow({
          where: { id: account.id },
        });

        if (lockedAccount.balance < amountBigInt) {
          throw new BadRequestException({
            code: EconomyErrorCodes.INSUFFICIENT_FUNDS,
            message: 'رصيد الحساب غير كافٍ لإتمام العملية.',
          });
        }

        const newBalanceBigInt = lockedAccount.balance - amountBigInt;

        // Step 4: Insert ledger entry
        const entry = await tx.currencyLedgerEntry.create({
          data: {
            userId,
            currencyKind,
            scopeType: options.scopeType || null,
            scopeId: options.scopeId || null,
            direction: 'DEBIT',
            amount: amountBigInt,
            balanceAfter: newBalanceBigInt,
            sourceType,
            sourceId: options.sourceId || null,
            idempotencyKey,
            requestFingerprint: options.requestFingerprint || null,
            metadata: options.metadata ? JSON.parse(JSON.stringify(options.metadata)) : undefined,
          },
        });

        // Step 5: Update materialized balance
        await tx.currencyAccount.update({
          where: { id: account.id },
          data: { balance: newBalanceBigInt },
        });

        return {
          status: 'APPLIED' as const,
          entry,
          newBalance: Number(newBalanceBigInt),
        };
      });
    } catch (err: any) {
      if (err?.code === 'P2002' || err?.message?.includes('23505')) {
        const saved = await this.prisma.currencyLedgerEntry.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey } },
        });
        if (saved) {
          this.assertLedgerReplayMatches(saved, currencyKind, 'DEBIT', amountBigInt, sourceType, options);
          return {
            status: 'RECOVERED' as const,
            entry: saved,
            newBalance: Number(saved.balanceAfter),
          };
        }
      }
      throw err;
    }
  }

  /**
   * Initializes player economy with exactly 500 welcome Coins.
   * Idempotent and concurrency-safe across repeated calls.
   */
  async initializeWelcomeEconomy(userId: string, clientTransactionId: string): Promise<EconomyOverviewDto> {
    const idempotencyKey = `welcome:${userId}`;
    const fingerprint = hashEconomyRequest(userId, 'WELCOME_BONUS:v1', { amount: 500, currencyKind: 'COIN' });

    // Execute credit of 500 Coins
    await this.creditCurrency(
      userId,
      'COIN',
      EconomyService.WELCOME_COINS,
      'WELCOME_BONUS',
      idempotencyKey,
      {
        requestFingerprint: fingerprint,
        metadata: { welcomeBonus: true, clientTransactionId },
      },
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
      const gemAccount = await tx.currencyAccount.findFirst({
        where: { userId, currencyKind: 'GEM', scopeType: null, scopeId: null },
      });
      if (!gemAccount) {
        await tx.currencyAccount.create({
          data: { userId, currencyKind: 'GEM', scopeType: null, scopeId: null, balance: BigInt(0) },
        });
      }
    });

    return this.getEconomyOverview(userId);
  }

  /**
   * Returns authoritative user balances across all currencies and active event scopes.
   */
  async getEconomyOverview(userId: string): Promise<EconomyOverviewDto> {
    const accounts = await this.prisma.currencyAccount.findMany({
      where: { userId },
      orderBy: [{ currencyKind: 'asc' }, { scopeId: 'asc' }],
    });

    let coins = 0;
    let gems = 0;
    const eventTokens: {
      scopeType: CurrencyScopeType;
      scopeId: string;
      balance: number;
    }[] = [];

    const accountDtos = accounts.map((acc) => {
      const balanceNum = Number(acc.balance);
      if (acc.currencyKind === 'COIN') {
        coins = balanceNum;
      } else if (acc.currencyKind === 'GEM') {
        gems = balanceNum;
      } else if (acc.currencyKind === 'EVENT_TOKEN' && acc.scopeType && acc.scopeId) {
        eventTokens.push({
          scopeType: acc.scopeType as CurrencyScopeType,
          scopeId: acc.scopeId,
          balance: balanceNum,
        });
      }

      return {
        currencyKind: acc.currencyKind as CurrencyKind,
        scopeType: acc.scopeType as CurrencyScopeType | null,
        scopeId: acc.scopeId,
        balance: balanceNum,
      };
    });

    return {
      coins,
      gems,
      eventTokens,
      accounts: accountDtos,
    };
  }

  /**
   * Bounded paginated history of user ledger entries.
   */
  async getLedgerHistory(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: CurrencyLedgerEntryDto[]; total: number; page: number; limit: number }> {
    const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(1, limit), 50) : 20;
    const safePage = Number.isInteger(page) ? Math.max(1, page) : 1;
    const skip = (safePage - 1) * safeLimit;

    const [entries, total] = await Promise.all([
      this.prisma.currencyLedgerEntry.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.currencyLedgerEntry.count({ where: { userId } }),
    ]);

    return {
      data: entries.map((e) => ({
        id: e.id,
        currencyKind: e.currencyKind as CurrencyKind,
        scopeType: e.scopeType as CurrencyScopeType | null,
        scopeId: e.scopeId,
        direction: e.direction as 'CREDIT' | 'DEBIT',
        amount: Number(e.amount),
        balanceAfter: Number(e.balanceAfter),
        sourceType: e.sourceType as CurrencyLedgerSource,
        sourceId: e.sourceId,
        idempotencyKey: e.idempotencyKey,
        createdAt: e.createdAt.toISOString(),
      })),
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  /**
   * Reconciliation audit utility:
   * Asserts sum(credits) - sum(debits) === CurrencyAccount.balance for each account of user.
   */
  async reconcileUserLedger(userId: string): Promise<{ isReconciled: boolean; differences: any[] }> {
    const rows = await this.prisma.$queryRaw<Array<{
      currencyKind: CurrencyKind;
      scopeType: CurrencyScopeType | null;
      scopeId: string | null;
      projectedBalance: bigint | null;
      calculatedFromLedger: bigint | null;
    }>>`
      WITH accounts AS (
        SELECT * FROM "currency_accounts" WHERE "userId" = ${userId}
      ), ledger AS (
        SELECT "currencyKind", "scopeType", "scopeId",
          SUM(CASE WHEN "direction" = 'CREDIT' THEN "amount" ELSE -"amount" END)::bigint AS balance
        FROM "currency_ledger_entries"
        WHERE "userId" = ${userId}
        GROUP BY "currencyKind", "scopeType", "scopeId"
      )
      SELECT COALESCE(a."currencyKind", l."currencyKind") AS "currencyKind",
        COALESCE(a."scopeType", l."scopeType") AS "scopeType",
        COALESCE(a."scopeId", l."scopeId") AS "scopeId",
        a."balance" AS "projectedBalance", l.balance AS "calculatedFromLedger"
      FROM accounts a
      FULL OUTER JOIN ledger l
        ON a."currencyKind" = l."currencyKind"
       AND a."scopeType" IS NOT DISTINCT FROM l."scopeType"
       AND a."scopeId" IS NOT DISTINCT FROM l."scopeId"
      WHERE COALESCE(a."balance", -1) <> COALESCE(l.balance, 0)
    `;

    const differences = rows.map((row) => ({
      currencyKind: row.currencyKind,
      scopeType: row.scopeType,
      scopeId: row.scopeId,
      projectedBalance: row.projectedBalance?.toString() ?? null,
      calculatedFromLedger: row.calculatedFromLedger?.toString() ?? '0',
    }));

    return {
      isReconciled: differences.length === 0,
      differences,
    };
  }

  private assertLedgerReplayMatches(
    entry: any,
    currencyKind: CurrencyKind,
    direction: 'CREDIT' | 'DEBIT',
    amount: bigint,
    sourceType: CurrencyLedgerSource,
    options: CreditOptions | DebitOptions,
  ) {
    const matches =
      entry.currencyKind === currencyKind &&
      entry.direction === direction &&
      entry.amount === amount &&
      entry.sourceType === sourceType &&
      entry.sourceId === (options.sourceId || null) &&
      entry.scopeType === (options.scopeType ?? null) &&
      entry.scopeId === (options.scopeId ?? null) &&
      (entry.requestFingerprint ?? null) === (options.requestFingerprint ?? null);
    if (!matches) {
      throw new ConflictException({
        code: EconomyErrorCodes.IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST,
        message: 'Idempotency key reused with different request payload.',
      });
    }
  }
}
