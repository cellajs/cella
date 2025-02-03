import { hash, verify } from '@node-rs/argon2';
import { env } from '../../../../env';
/**
 * Hashes a password using argon2id with a secret for enhanced security.
 * https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#argon2id
 *
 * @param password - Plain-text password to be hashed.
 * @returns A hashed password.
 */
export const hashPassword = async (password: string) => {
  return await hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
    secret: Buffer.from(env.ARGON_SECRET, 'utf-8'),
  });
};

/**
 * Verifies if a password matches its hash using argon2id and a secret.
 *
 * @param hash - Stored password hash.
 * @param password - Plain-text password to verify.
 * @returns Boolean(is password matches the hash)
 */
export const verifyPasswordHash = async (hash: string, password: string) => {
  return await verify(hash, password, {
    secret: Buffer.from(env.ARGON_SECRET, 'utf-8'),
  });
};
