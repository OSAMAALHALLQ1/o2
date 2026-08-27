import * as crypto from 'crypto';
import { hash, verify } from '@node-rs/argon2';

/**
 * Production-grade Argon2id password hashing and verification utility.
 * Implements RFC 9106 recommended parameters:
 * - Algorithm: Argon2id (variant 2)
 * - Memory Cost: 19456 KiB (19 MiB)
 * - Time Cost: 3 iterations
 * - Parallelism (Threads): 4 lanes
 * - Output Length: 32 bytes
 */
export class PasswordUtil {
  public static readonly ARGON2_CONFIG = {
    algorithm: 2,      // Algorithm.Argon2id
    memoryCost: 19456, // 19 MiB
    timeCost: 3,       // 3 iterations
    parallelism: 4,    // 4 threads
    outputLen: 32,     // 32-byte key
  };

  /**
   * Hashes a plaintext password using official Argon2id N-API bindings.
   */
  static async hash(password: string): Promise<string> {
    return hash(password, this.ARGON2_CONFIG);
  }

  /**
   * Verifies a plaintext password against a stored Argon2id hash.
   * Handles malformed hashes safely by catching errors and returning false.
   */
  static async verify(password: string, storedHash: string): Promise<boolean> {
    if (!storedHash || typeof storedHash !== 'string' || !storedHash.startsWith('$argon2id$')) {
      return false;
    }
    try {
      return await verify(storedHash, password);
    } catch {
      return false;
    }
  }

  /**
   * Computes a deterministic SHA-256 hash of a refresh token for lookup & storage at rest.
   */
  static hashRefreshToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Constant-time comparison of a refresh token against stored hash.
   */
  static verifyRefreshToken(token: string, storedHash: string): boolean {
    const computed = this.hashRefreshToken(token);
    const bufA = Buffer.from(computed, 'hex');
    const bufB = Buffer.from(storedHash, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }
}
