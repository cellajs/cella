import { z } from '@hono/zod-openapi';
import { sql } from 'drizzle-orm';
import { baseDb, type DbOrTx } from '#/db/db';
import { env } from '#/env';
import { clearOauthClientCache, invalidateOauthClientCache } from '#/modules/oauth-server/client-cache';
import { log } from '#/utils/logger';
import { clearApiKeyCache, invalidateApiKeyCacheByAccount } from './api-key-cache';
import { clearAuthCache, invalidateAuthCacheByUser } from './auth-cache';
import { clearOrgCache, invalidateOrgCache, invalidateOrgCacheByTenant } from './org-cache';
import { clearTenantCache, invalidateTenantCache } from './tenant-cache';
import {
  clearTokenGrantCache,
  invalidateTokenGrant,
  invalidateTokenGrantsByActor,
  invalidateTokenGrantsByTenant,
} from './token-grant-cache';

/** The Postgres channel every process with guard caches (api, mcp, oauth) listens on. */
export const authInvalidateChannel = 'auth_invalidate';

const authInvalidationSchema = z.union([
  z.object({ user: z.string() }),
  z.object({ org: z.object({ tenantId: z.string(), orgId: z.string() }) }),
  z.object({ tenant: z.string() }),
  z.object({ grant: z.object({ accountId: z.string(), grantId: z.string() }) }),
  z.object({ serviceAccount: z.string() }),
  z.object({ installation: z.object({ tenantId: z.string(), clientId: z.string() }) }),
]);

/**
 * What one message drops: a user's sessions, memberships and access-token verdicts; an organization; a tenant with its
 * organizations and the verdicts on tokens naming it; the verdicts on one grant's tokens; a service account's API
 * keys, token verdicts and client; or the verdicts on one installed app's tokens in its tenant.
 */
export type AuthInvalidation = z.infer<typeof authInvalidationSchema>;

/** The invalidation a message carries, or null for a payload that is not one. */
export const parseAuthInvalidation = (payload: string): AuthInvalidation | null => {
  try {
    const parsed = authInvalidationSchema.safeParse(JSON.parse(payload));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

/** Drops what an invalidation names from this process's guard caches. */
export const dropCachedAuth = (invalidation: AuthInvalidation): void => {
  if ('user' in invalidation) {
    invalidateAuthCacheByUser(invalidation.user);
    invalidateTokenGrantsByActor(invalidation.user);
  } else if ('org' in invalidation) invalidateOrgCache(invalidation.org.tenantId, invalidation.org.orgId);
  else if ('tenant' in invalidation) {
    // The org cache keys are prefixed by tenantId.
    invalidateTenantCache(invalidation.tenant);
    invalidateOrgCacheByTenant(invalidation.tenant);
    invalidateTokenGrantsByTenant(invalidation.tenant);
  } else if ('grant' in invalidation) invalidateTokenGrant(invalidation.grant.accountId, invalidation.grant.grantId);
  else if ('serviceAccount' in invalidation) {
    invalidateApiKeyCacheByAccount(invalidation.serviceAccount);
    invalidateOauthClientCache(invalidation.serviceAccount);
  } else invalidateTokenGrantsByTenant(invalidation.installation.tenantId, invalidation.installation.clientId);
};

/** Drops every entry of every guard cache: what a process does when it may have missed messages. */
export const clearCachedAuth = (): void => {
  clearAuthCache();
  clearOrgCache();
  clearTenantCache();
  clearTokenGrantCache();
  clearApiKeyCache();
  clearOauthClientCache();
};

/**
 * Tells every listening process, this one included, to drop what the invalidation names. Inside a transaction the
 * message goes out when it commits, and not at all when it rolls back.
 */
export const publishAuthInvalidation = async (db: DbOrTx, invalidation: AuthInvalidation): Promise<void> => {
  if (env.NODB) return;
  await db.execute(sql`select pg_notify(${authInvalidateChannel}, ${JSON.stringify(invalidation)})`);
};

/** Drops here at once and in the other processes through `auth_invalidate`; a failed publish leaves them to the TTL. */
const invalidate = (invalidation: AuthInvalidation): void => {
  dropCachedAuth(invalidation);
  publishAuthInvalidation(baseDb, invalidation).catch((error) => {
    log.warn('Failed to publish a cache invalidation', { error, invalidation });
  });
};

/**
 * Drops the cached sessions, memberships and access-token verdicts. Call after profile updates, membership changes, or
 * sign-out.
 */
function user(userId: string): void {
  invalidate({ user: userId });
}

/** Call after org name/settings updates or org deletion. */
function org(tenantId: string, orgId: string): void {
  invalidate({ org: { tenantId, orgId } });
}

/** Call after tenant updates or deletion. Cascades to the tenant's organizations and the verdicts on its tokens. */
function tenant(tenantId: string): void {
  invalidate({ tenant: tenantId });
}

/** Call after a service account's status or keys change: its API keys, token verdicts and client drop. */
function serviceAccount(accountId: string): void {
  invalidate({ serviceAccount: accountId });
}

/** Call after an installed app changes in a tenant: the verdicts on its users' tokens there drop. */
function installation(tenantId: string, clientId: string): void {
  invalidate({ installation: { tenantId, clientId } });
}

/**
 * Every call drops the entries in every process: here at once, elsewhere through `auth_invalidate`. A deleted grant
 * publishes inside the deleting transaction (`deleteConsentWithTokens`).
 */
export const invalidateCache = { user, org, tenant, serviceAccount, installation };
