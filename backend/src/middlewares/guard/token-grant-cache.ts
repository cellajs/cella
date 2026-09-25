import { TTLCache } from '#/lib/ttl-cache';
import type { GrantRefusal } from '#/modules/oauth-server/grant-policy';
import type { VerifiedAccessToken } from '#/modules/oauth-server/verify-access-token';
import type { ServiceAccountModel } from '#/modules/service-accounts/service-accounts-db';
import type { UserModel } from '#/modules/user/user-db';

/** The grant policy's answer on an access token's grant or API key, with the row the token's actor is built from. */
export type TokenGrantEntry =
  | { refusal: GrantRefusal | 'grant_revoked' }
  | { refusal: null; kind: 'user'; user: UserModel }
  | { refusal: null; kind: 'service'; account: ServiceAccountModel };

/** A verdict with the tenant and client its token names, so a change to either finds every verdict it affects. */
interface CachedVerdict {
  entry: TokenGrantEntry;
  tenantId: string;
  clientId: string;
}

/**
 * Keyed `<actor id>:<grant id>:<tenant>` or `<actor id>:<key id>`, so every verdict about one actor, or on one grant,
 * drops by prefix. Whatever ends a grant or key, or changes the user, the account, an installation or a tenant's
 * policy, drops the verdicts it affects in every process through `auth_invalidate`.
 */
const tokenGrantCache = new TTLCache<CachedVerdict>({ maxSize: 5000, defaultTtl: 30_000 });

const keyOf = (token: VerifiedAccessToken) =>
  token.kind === 'user' ? `${token.actorId}:${token.grantId}:${token.tenantId}` : `${token.actorId}:${token.keyId}`;

export const getTokenGrantCache = (token: VerifiedAccessToken): TokenGrantEntry | undefined =>
  tokenGrantCache.get(keyOf(token))?.entry;

export const setTokenGrantCache = (token: VerifiedAccessToken, entry: TokenGrantEntry): void => {
  tokenGrantCache.set(keyOf(token), { entry, tenantId: token.tenantId, clientId: token.clientId });
};

/** After a change to an actor's user row, memberships, account, keys or grants. */
export const invalidateTokenGrantsByActor = (actorId: string): void => {
  tokenGrantCache.invalidateByPrefix(`${actorId}:`);
};

/** After a grant is deleted: the verdicts on its tokens, in every tenant they name. */
export const invalidateTokenGrant = (accountId: string, grantId: string): void => {
  tokenGrantCache.invalidateByPrefix(`${accountId}:${grantId}:`);
};

/** After a tenant's policy changes, or with `clientId` one installation in it: the verdicts on tokens naming it. */
export const invalidateTokenGrantsByTenant = (tenantId: string, clientId?: string): void => {
  tokenGrantCache.invalidateWhere(
    (verdict) => verdict.tenantId === tenantId && (clientId === undefined || verdict.clientId === clientId),
  );
};

/** Drops every verdict: a process whose invalidation channel reconnects may have missed messages. */
export const clearTokenGrantCache = (): void => tokenGrantCache.clear();
