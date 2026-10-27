import { TTLCache } from '#/lib/ttl-cache';
import type { OrganizationModel } from '#/modules/organization/organization-db';

const cacheKey = (tenantId: string, organizationId: string) => `${tenantId}:${organizationId}`;

const organizationCache = new TTLCache<OrganizationModel>({ maxSize: 5000, defaultTtl: 60_000 });

/**
 * The cached organization row, or else the one `read` resolves, cached for a minute.
 * @param tenantId - The tenant the lookup is bound to.
 * @param organizationId - The organization's id, lowercased as stored.
 * @param read - Reads the row within that tenant; undefined when it holds no such organization.
 * @returns The row, or undefined for an unknown organization, which is never cached.
 */
export const loadCachedOrganization = (
  tenantId: string,
  organizationId: string,
  read: () => Promise<OrganizationModel | undefined>,
): Promise<OrganizationModel | undefined> => organizationCache.load(cacheKey(tenantId, organizationId), read);

/** What a test seeds so the guard needs no database. */
export const setOrgCache = (tenantId: string, organizationId: string, organization: OrganizationModel): void => {
  organizationCache.set(cacheKey(tenantId, organizationId), organization);
};

/** After a write to the organization's row. */
export const dropCachedOrganization = (tenantId: string, organizationId: string): void => {
  organizationCache.delete(cacheKey(tenantId, organizationId));
};

/** After a write to the tenant: every organization cached under it. */
export const dropCachedOrganizations = (tenantId: string): void => {
  organizationCache.invalidateByPrefix(`${tenantId}:`);
};

/** Drops every entry: what a test does to stand in for the TTL passing. */
export const clearOrgCache = (): void => {
  organizationCache.clear();
};
