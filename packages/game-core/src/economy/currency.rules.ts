import { createHash } from 'node:crypto';
import { CurrencyKind, CurrencyScopeType } from '@o2/types';

export interface CurrencyScopeValidationInput {
  currencyKind: CurrencyKind;
  scopeType?: CurrencyScopeType | null;
  scopeId?: string | null;
}

export function validateCurrencyScope(input: CurrencyScopeValidationInput): {
  isValid: boolean;
  error?: string;
} {
  const { currencyKind, scopeType, scopeId } = input;

  if (currencyKind === 'COIN' || currencyKind === 'GEM') {
    if (scopeType !== null && scopeType !== undefined) {
      return {
        isValid: false,
        error: `${currencyKind} must not have a scopeType. It is a global currency.`,
      };
    }
    if (scopeId !== null && scopeId !== undefined && scopeId.trim() !== '') {
      return {
        isValid: false,
        error: `${currencyKind} must not have a scopeId. It is a global currency.`,
      };
    }
    return { isValid: true };
  }

  if (currencyKind === 'EVENT_TOKEN') {
    if (!scopeType || (scopeType !== 'EVENT' && scopeType !== 'SEASON')) {
      return {
        isValid: false,
        error: 'EVENT_TOKEN requires a valid scopeType (EVENT or SEASON).',
      };
    }
    if (!scopeId || scopeId.trim() === '') {
      return {
        isValid: false,
        error: 'EVENT_TOKEN requires a non-empty scopeId (e.g. event-summer-2026).',
      };
    }
    return { isValid: true };
  }

  return {
    isValid: false,
    error: `Unknown currency kind: ${currencyKind}`,
  };
}

export function validateIntegerAmount(amount: unknown): {
  isValid: boolean;
  error?: string;
} {
  if (typeof amount !== 'number' || !Number.isInteger(amount)) {
    return {
      isValid: false,
      error: 'Amount must be an integer.',
    };
  }
  if (amount <= 0) {
    return {
      isValid: false,
      error: 'Amount must be greater than zero.',
    };
  }
  if (amount > Number.MAX_SAFE_INTEGER) {
    return {
      isValid: false,
      error: 'Amount exceeds safe integer range.',
    };
  }
  return { isValid: true };
}

export function hashEconomyRequest(
  userId: string,
  operation: string,
  payload: Record<string, unknown>,
): string {
  const data = `${operation}:${userId}:${canonicalJson(payload)}`;
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new TypeError('Economy request fingerprints do not support undefined or non-JSON values.');
    }
    return serialized;
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  }

  const objectValue = value as Record<string, unknown>;
  const entries = Object.keys(objectValue)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(objectValue[key])}`);
  return `{${entries.join(',')}}`;
}
