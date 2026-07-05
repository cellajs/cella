import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { env } from '#/env';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const HKDF_SALT = 'cella:data-encryption';

const encode = (value: Buffer) => value.toString('base64url');
const decode = (value: string) => Buffer.from(value, 'base64url');

const deriveKey = (purpose: string): Buffer =>
  Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(env.DATA_ENCRYPTION_KEY, 'utf8'),
      Buffer.from(HKDF_SALT, 'utf8'),
      Buffer.from(purpose, 'utf8'),
      KEY_BYTES,
    ),
  );

export const isEncryptedData = (value: string): boolean => value.startsWith(`${VERSION}:`);

export const encryptData = (plaintext: string, purpose: string): string => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, deriveKey(purpose), iv, { authTagLength: AUTH_TAG_BYTES });
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [VERSION, encode(iv), encode(ciphertext), encode(authTag)].join(':');
};

export const decryptData = (encryptedValue: string, purpose: string): string => {
  const [version, encodedIv, encodedCiphertext, encodedAuthTag, ...extra] = encryptedValue.split(':');
  if (version !== VERSION || !encodedIv || !encodedCiphertext || !encodedAuthTag || extra.length) {
    throw new Error('Invalid encrypted data format');
  }

  const decipher = createDecipheriv(ALGORITHM, deriveKey(purpose), decode(encodedIv), {
    authTagLength: AUTH_TAG_BYTES,
  });
  decipher.setAuthTag(decode(encodedAuthTag));

  return Buffer.concat([decipher.update(decode(encodedCiphertext)), decipher.final()]).toString('utf8');
};
