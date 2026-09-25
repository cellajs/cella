import { z } from '@hono/zod-openapi';
import { sql } from 'drizzle-orm';
import { baseDb, type DbOrTx } from '#/db/db';
import { env } from '#/env';
import { log } from '#/utils/logger';
import { invalidateAuthCacheByUser } from './auth-cache';
import { invalidateOrgCache, invalidateOrgCacheByTenant } from './org-cache';
import { invalidateTenantCache } from './tenant-cache';

/** The Postgres channel every process with guard caches (api, mcp, oauth) listens on. */
export const authInvalidateChannel = 'auth_invalidate';

const authInvalidationSchema = z.union([
  z.object({ user: z.string() }),
  z.object({ org: z.object({ tenantId: z.string(), orgId: z.string() }) }),
  z.object({ tenant: z.string() }),
]);

/** What one message drops: a user's sessions, memberships and token user, an organization, or a tenant with its organizations. */
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
  if ('user' in invalidation) invalidateAuthCacheByUser(invalidation.user);
  else if ('org' in invalidation) invalidateOrgCache(invalidation.org.tenantId, invalidation.org.orgId);
  else {
    // The org cache keys are prefixed by tenantId.
    invalidateTenantCache(invalidation.tenant);
    invalidateOrgCacheByTenant(invalidation.tenant);
  }
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

/** Drops the cached sessions and memberships. Call after profile updates, membership changes, or sign-out. */
function user(userId: string): void {
  invalidate({ user: userId });
}

/** Call after org name/settings updates or org deletion. */
function org(tenantId: string, orgId: string): void {
  invalidate({ org: { tenantId, orgId } });
}

/** Call after tenant updates or deletion. Cascades to the tenant's organizations. */
function tenant(tenantId: string): void {
  invalidate({ tenant: tenantId });
}

/** Every call drops the entries in every process: here at once, elsewhere through `auth_invalidate`. */
export const invalidateCache = { user, org, tenant };
