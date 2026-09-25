import { TTLCache } from '#/lib/ttl-cache';
import type { GrantRefusal } from '#/modules/oauth-server/grant-policy';
import type { ServiceAccountModel } from '#/modules/service-accounts/service-accounts-db';
import type { UserModel } from '#/modules/user/user-db';

/** The grant policy's answer on an access token's grant or API key, with the row the token's actor is built from. */
export type TokenGrantEntry =
  | { refusal: GrantRefusal | 'grant_revoked' }
  | { refusal: null; kind: 'user'; user: UserModel }
  | { refusal: null; kind: 'service'; account: ServiceAccountModel };

/**
 * Keyed `<actor id>:<grant id>:<tenant>` or `<actor id>:<key id>`, so every verdict about one actor drops at once. A
 * user change drops them in every process through `auth_invalidate`; other changes made in another process show
 * within the TTL.
 */
const tokenGrantCache = new TTLCache<TokenGrantEntry>({ maxSize: 5000, defaultTtl: 30_000 });

export const getTokenGrantCache = (actorId: string, key: string): TokenGrantEntry | undefined =>
  tokenGrantCache.get(`${actorId}:${key}`);

export const setTokenGrantCache = (actorId: string, key: string, entry: TokenGrantEntry): void => {
  tokenGrantCache.set(`${actorId}:${key}`, entry);
};

/** After a change to an actor's user row, memberships, account, keys or grants. */
export const invalidateTokenGrantsByActor = (actorId: string): void => {
  tokenGrantCache.invalidateByPrefix(`${actorId}:`);
};

/** Drops every verdict: a process whose invalidation channel reconnects may have missed messages. */
export const clearTokenGrantCache = (): void => tokenGrantCache.clear();
