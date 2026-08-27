/**
 * Deterministic email normalization utility for O2 Universe identity management.
 * Trims whitespace and normalizes ASCII casing to lowercase.
 */
export function normalizeEmail(email: string): string {
  if (!email || typeof email !== 'string') {
    return '';
  }
  return email.trim().toLowerCase();
}
