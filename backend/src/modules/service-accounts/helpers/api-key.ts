import { randomBytes } from 'node:crypto';
import { crc32 } from 'node:zlib';
import type { Context } from 'hono';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import type { CredentialType, InsertCredentialModel } from '#/modules/service-accounts/credentials-db';
import { hashToken } from '#/utils/hash-token';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const SECRET_LENGTH = 32;
const CHECKSUM_LENGTH = 6;

/** The wire tag of each credential type: `<app>_sk_…` is a secret key, `<app>_pk_…` a publishable one. */
const wireTags = { secret: 'sk', publishable: 'pk' } as const satisfies Record<CredentialType, string>;
type WireTag = (typeof wireTags)[CredentialType];
const typeOfTag = Object.fromEntries(Object.entries(wireTags).map(([type, tag]) => [tag, type])) as Record<
  WireTag,
  CredentialType
>;

/** `live` keys exist only in production; everything else mints `test` keys. */
type KeyEnv = 'live' | 'test';

/** What a well-formed key of this app says about itself, in the columns the credentials row stores. */
export type ParsedApiKey = Pick<InsertCredentialModel, 'prefix' | 'last4' | 'hash'> & {
  type: CredentialType;
  env: KeyEnv;
};

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
  let out = '';
  for (const byte of randomBytes(length)) out += BASE62[byte % 62];
  return out;
};

const checksumOf = (body: string): string => toBase62(crc32(body), CHECKSUM_LENGTH);

const keyPattern = new RegExp(
  `^${appConfig.slug}_(sk|pk)_(live|test)_([0-9A-Za-z]{${SECRET_LENGTH}})([0-9A-Za-z]{${CHECKSUM_LENGTH}})$`,
);

/**
 * `<app>_sk_live_<32 base62><6 base62 crc32>`: scannable by prefix, checkable offline, dispatched on shape by the
 * guard. Returns the plaintext (shown once) and what is stored about it.
 */
export function generateApiKey(type: CredentialType): { key: string; parsed: ParsedApiKey } {
  const env: KeyEnv = appConfig.mode === 'production' ? 'live' : 'test';
  const body = `${appConfig.slug}_${wireTags[type]}_${env}_${randomBase62(SECRET_LENGTH)}`;
  const key = `${body}${checksumOf(body)}`;
  const parsed = parseApiKey(key);
  if (!parsed) throw new Error('Generated key failed its own parse');
  return { key, parsed };
}

/** Null for anything that is not a well-formed key of this app; the checksum rejects typos before a database lookup. */
export function parseApiKey(key: string): ParsedApiKey | null {
  const match = keyPattern.exec(key);
  if (!match) return null;
  const [, tag, env, secret, checksum] = match as unknown as [string, WireTag, KeyEnv, string, string];
  const body = `${appConfig.slug}_${tag}_${env}_${secret}`;
  if (checksumOf(body) !== checksum) return null;
  return {
    type: typeOfTag[tag],
    env,
    prefix: `${appConfig.slug}_${tag}_${env}_${secret.slice(0, 4)}`,
    last4: secret.slice(-4),
    hash: hashToken(key),
  };
}

/** The raw key from `Authorization: Bearer` or `x-api-key`, when the request carries one of this app's keys. */
export function apiKeyFrom(ctx: Context<Env>): string | null {
  const bearer = ctx.req.header('authorization');
  const fromBearer = bearer?.toLowerCase().startsWith('bearer ') ? bearer.slice(7).trim() : null;
  const value = fromBearer ?? ctx.req.header('x-api-key')?.trim() ?? null;
  return value?.startsWith(`${appConfig.slug}_`) ? value : null;
}

/** Cheap header check for dispatch (CSRF skip, `actorGuard`): no parsing, no lookup. */
export const hasApiKeyHeader = (ctx: Context<Env>): boolean => apiKeyFrom(ctx) !== null;
