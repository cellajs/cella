import { TTLCache } from '#/lib/ttl-cache';
import type { UserGrantRefusal } from '#/modules/oauth-server/grant-policy';
import type { VerifiedAccessToken } from '#/modules/oauth-server/verify-access-token';
import type { UserModel } from '#/modules/user/user-db';

/** The grant policy's answer on a person's live grant in one tenant, with the user row the token's actor is built from. */
export type TokenGrantEntry = { refusal: UserGrantRefusal } | { refusal: null; user: UserModel };

/** A verdict with the tenant and client its token names, so a change to either finds every verdict it affects. */
interface CachedVerdict {
  entry: TokenGrantEntry;
  tenantId: string;
  clientId: string;
}

type UserToken = Extract<VerifiedAccessToken, { kind: 'user' }>;

/**
 * Keyed `<user id>:<grant id>:<tenant>:<bindings version>`, so every verdict about one user, or on one grant, drops by
 * prefix, and a verdict answers only to the bindings version it was reached at, since the policy asks whether the user
 * is a member of the tenant. The guard reads the grant and the bindings version at every use; the rest of what this
 * caches (the user row, an installed app, the tenant's policy) is dropped here at once by `invalidateCache` and holds
 * for at most 15 seconds in other processes.
 */
const tokenGrantCache = new TTLCache<CachedVerdict>({ maxSize: 5000, defaultTtl: 15_000 });

const keyOf = (token: UserToken, bindingsVersion: string) => `${token.actorId}:${token.grantId}:${token.tenantId}:${bindingsVersion}`;

/**
 * The verdict cached for the token at the bindings version the request read, or else the one `read` resolves, cached
 * for the token's next uses.
 * @param token - The verified user token.
 * @param bindingsVersion - `actors.bindings_version` as the request read it.
 * @param read - Reaches the grant policy's verdict; a refusal is a verdict and is cached like any other.
 * @returns The verdict.
 */
export const loadTokenGrantCache = async (
  token: UserToken,
  bindingsVersion: string,
  read: () => Promise<TokenGrantEntry>,
): Promise<TokenGrantEntry> => {
  const verdict = await tokenGrantCache.load(keyOf(token, bindingsVersion), async () => ({
    entry: await read(),
    tenantId: token.tenantId,
    clientId: token.clientId,
  }));
  return verdict.entry;
};

/** After a change to a user's row. */
export const invalidateTokenGrantsByActor = (actorId: string): void => {
  tokenGrantCache.invalidateByPrefix(`${actorId}:`);
};

/** After a grant is deleted: the verdicts on its tokens, in every tenant they name. */
export const invalidateTokenGrant = (accountId: string, grantId: string): void => {
  tokenGrantCache.invalidateByPrefix(`${accountId}:${grantId}:`);
};

/** After a tenant's policy changes, or with `clientId` one installation in it: the verdicts on tokens naming it. */
export const invalidateTokenGrantsByTenant = (tenantId: string, clientId?: string): void => {
  tokenGrantCache.invalidateWhere((verdict) => verdict.tenantId === tenantId && (clientId === undefined || verdict.clientId === clientId));
};
