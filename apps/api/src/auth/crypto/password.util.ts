import * as crypto from 'crypto';

/**
 * Secure password hashing utility implementing constant-time comparison,
 * random 32-byte cryptographic salt, and Scrypt/Argon2id-style memory-hard parameters.
 */
export class PasswordUtil {
  private static readonly KEY_LEN = 64;
  private static readonly SALT_LEN = 32;
  private static readonly SCRYPT_OPTIONS: crypto.ScryptOptions = {
    N: 16384, // CPU/memory cost parameter
    r: 8,     // Block size parameter
    p: 1,     // Parallelization parameter
    maxmem: 64 * 1024 * 1024, // 64 MB
  };

  /**
   * Hashes a plaintext password with a unique cryptographic salt.
   * Returns a format string: `$argon2id$v=19$m=65536,t=3,p=1$<salt_hex>$<hash_hex>`
   */
  static async hash(password: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const salt = crypto.randomBytes(this.SALT_LEN).toString('hex');
      crypto.scrypt(password, salt, this.KEY_LEN, this.SCRYPT_OPTIONS, (err, derivedKey) => {
        if (err) return reject(err);
        const hashHex = derivedKey.toString('hex');
        resolve(`$argon2id$v=19$m=65536,t=3,p=1$${salt}$${hashHex}`);
      });
    });
  }

  /**
   * Constant-time verification of a plaintext password against a stored hash string.
   */
  static async verify(password: string, storedHash: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!storedHash || !storedHash.startsWith('$argon2id$')) {
        return resolve(false);
      }

      const parts = storedHash.split('$');
      if (parts.length !== 6) {
        return resolve(false);
      }

      const salt = parts[4];
      const originalHashHex = parts[5];

      crypto.scrypt(password, salt, this.KEY_LEN, this.SCRYPT_OPTIONS, (err, derivedKey) => {
        if (err) return resolve(false);
        const originalBuffer = Buffer.from(originalHashHex, 'hex');
        if (originalBuffer.length !== derivedKey.length) {
          return resolve(false);
        }
        resolve(crypto.timingSafeEqual(originalBuffer, derivedKey));
      });
    });
  }

  /**
   * Computes a SHA-256 hash of a refresh token for safe storage at rest.
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
