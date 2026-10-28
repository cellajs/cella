import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { env } from '#/env';

const formatVersion = 'v1';
const algorithm = 'aes-256-gcm';
const keyBytes = 32;
const ivBytes = 12;
const authTagBytes = 16;
// A fixed, product-neutral salt: changing it re-keys every stored ciphertext.
const hkdfSalt = 'data-encryption';

const encode = (value: Buffer) => value.toString('base64url');
const decode = (value: string) => Buffer.from(value, 'base64url');

const deriveKey = (purpose: string): Buffer => {
  const secret = Buffer.from(env.DATA_ENCRYPTION_KEY, 'utf8');
  const salt = Buffer.from(hkdfSalt, 'utf8');
  const info = Buffer.from(purpose, 'utf8');
  return Buffer.from(hkdfSync('sha256', secret, salt, info, keyBytes));
};

/**
 * AES-256-GCM under a key derived from `DATA_ENCRYPTION_KEY` for `purpose`, so a value of one purpose never decrypts
 * as another.
 * @returns `v1:<iv>:<ciphertext>:<tag>`, base64url parts.
 */
export const encryptData = (plaintext: string, purpose: string): string => {
  const iv = randomBytes(ivBytes);
  const cipher = createCipheriv(algorithm, deriveKey(purpose), iv, { authTagLength: authTagBytes });
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [formatVersion, encode(iv), encode(ciphertext), encode(authTag)].join(':');
};

/**
 * Reverses `encryptData` for the same `purpose`.
 * @throws When the value is not of this format, or was encrypted for another purpose or with another key, or altered.
 */
export const decryptData = (encryptedValue: string, purpose: string): string => {
  const [version, encodedIv, encodedCiphertext, encodedAuthTag, ...extra] = encryptedValue.split(':');
  if (version !== formatVersion || !encodedIv || !encodedCiphertext || !encodedAuthTag || extra.length) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = decode(encodedIv);
  const decipher = createDecipheriv(algorithm, deriveKey(purpose), iv, { authTagLength: authTagBytes });
  decipher.setAuthTag(decode(encodedAuthTag));

  return Buffer.concat([decipher.update(decode(encodedCiphertext)), decipher.final()]).toString('utf8');
};
