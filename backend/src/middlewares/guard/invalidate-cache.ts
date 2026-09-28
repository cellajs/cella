import { z } from '@hono/zod-openapi';
import { sql } from 'drizzle-orm';
import type { DbOrTx } from '#/db/db';
import { env } from '#/env';
import { clearOauthClientCache, invalidateOauthClientCache } from '#/modules/oauth-server/client-cache';
import type { ServiceAccountModel } from '#/modules/service-accounts/service-accounts-db';
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
  z.object({ serviceAccount: z.object({ id: z.string(), tenantId: z.string(), clientId: z.string().nullable() }) }),
]);

/**
 * What one message drops: a user's sessions, memberships and access-token verdicts; an organization; a tenant with its
 * organizations and the verdicts on tokens naming it; the verdicts on one grant's tokens; or a service account's API
 * keys, token verdicts and client, plus the verdicts on its users' tokens in its tenant when it installs an app.
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
  else {
    const { id, tenantId, clientId } = invalidation.serviceAccount;
    invalidateApiKeyCacheByAccount(id);
    invalidateTokenGrantsByActor(id);
    invalidateOauthClientCache(id);
    // An installed app: its users' grants in the tenant rest on the installation (`grantRefusal`).
    if (clientId) invalidateTokenGrantsByTenant(tenantId, clientId);
  }
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

/** Drops here at once and publishes on `db`: on the writing transaction, the message commits with the write. */
const invalidate = async (db: DbOrTx, invalidation: AuthInvalidation): Promise<void> => {
  dropCachedAuth(invalidation);
  await publishAuthInvalidation(db, invalidation);
};

/** The cached sessions, memberships and access-token verdicts: after profile updates, membership changes or sign-out. */
function user(db: DbOrTx, userId: string): Promise<void> {
  return invalidate(db, { user: userId });
}

/** After org name/settings updates or org deletion. */
function org(db: DbOrTx, tenantId: string, orgId: string): Promise<void> {
  return invalidate(db, { org: { tenantId, orgId } });
}

/** After tenant updates or deletion. Cascades to the tenant's organizations and the verdicts on its tokens. */
function tenant(db: DbOrTx, tenantId: string): Promise<void> {
  return invalidate(db, { tenant: tenantId });
}

/**
 * After a service account's status or keys change: its API keys, token verdicts and client drop, and for an installed
 * app the verdicts on its users' tokens in the tenant.
 */
function serviceAccount(
  db: DbOrTx,
  { id, tenantId, oauthClientId }: Pick<ServiceAccountModel, 'id' | 'tenantId' | 'oauthClientId'>,
): Promise<void> {
  return invalidate(db, { serviceAccount: { id, tenantId, clientId: oauthClientId } });
}

/**
 * Every call drops the entries in every process: here at once, elsewhere through `auth_invalidate` when `db` commits.
 * Pass the writing transaction and call it last in it; a deleted grant publishes through `revokeGrant`.
 */
export const invalidateCache = { user, org, tenant, serviceAccount };
