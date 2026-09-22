import { randomBytes } from 'node:crypto';
import { crc32 } from 'node:zlib';
import { appConfig } from 'shared';
import { hashToken } from '#/utils/hash-token';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const SECRET_LENGTH = 32;
const CHECKSUM_LENGTH = 6;

export type CredentialKind = 'sk' | 'pk';
export type CredentialEnv = 'live' | 'test';

/** `<app>_sk_live_<32 base62><6 base62 checksum>`: scannable by prefix, checkable offline, dispatched on shape by the guard. */
export interface ParsedApiKey {
  kind: CredentialKind;
  env: CredentialEnv;
  /** Everything before the secret: what the UI and logs show. */
  prefix: string;
  last4: string;
  hash: string;
}

const toBase62 = (n: number, length: number): string => {
  let out = '';
  let value = n >>> 0;
  for (let i = 0; i < length; i++) {
    out = BASE62[value % 62] + out;
    value = Math.floor(value / 62);
  }
  return out;
};

const randomBase62 = (length: number): string => {
  const bytes = randomBytes(length);
  let out = '';
  for (const byte of bytes) out += BASE62[byte % 62];
  return out;
};

const checksumOf = (body: string): string => toBase62(crc32(body), CHECKSUM_LENGTH);

const keyPattern = new RegExp(
  `^${appConfig.slug}_(sk|pk)_(live|test)_([0-9A-Za-z]{${SECRET_LENGTH}})([0-9A-Za-z]{${CHECKSUM_LENGTH}})$`,
);

/** The plaintext key (returned once) and what is stored about it. */
export function generateApiKey(kind: CredentialKind, env: CredentialEnv): { key: string; parsed: ParsedApiKey } {
  const secret = randomBase62(SECRET_LENGTH);
  const body = `${appConfig.slug}_${kind}_${env}_${secret}`;
  const key = `${body}${checksumOf(body)}`;
  const parsed = parseApiKey(key);
  if (!parsed) throw new Error('Generated key failed its own parse');
  return { key, parsed };
}

/** Null for anything that is not a well-formed key of this app; the checksum rejects typos before a database lookup. */
export function parseApiKey(key: string): ParsedApiKey | null {
  const match = keyPattern.exec(key);
  if (!match) return null;
  const [, kind, env, secret, checksum] = match;
  const body = `${appConfig.slug}_${kind}_${env}_${secret}`;
  if (checksumOf(body) !== checksum) return null;
  return {
    kind: kind as CredentialKind,
    env: env as CredentialEnv,
    prefix: `${appConfig.slug}_${kind}_${env}_${secret.slice(0, 4)}`,
    last4: secret.slice(-4),
    hash: hashToken(key),
  };
}

/** Cheap shape check for header dispatch: is this credential one of this app's keys at all. */
export const looksLikeApiKey = (value: string): boolean => value.startsWith(`${appConfig.slug}_`);
