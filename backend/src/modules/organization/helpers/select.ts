import { sql } from 'drizzle-orm';
import { appConfig, type OrganizationFlags } from 'shared';
import { organizationsTable } from '#/modules/organization/organization-db';

/**
 * SQL select expression for `organizationFlags`: merges config-declared defaults under the stored
 * (sparse) bag, so a flag added to `defaultOrganizationFlags` later needs no backfill. Parallel to
 * the `userFlags` merge in the user select.
 */
export const organizationFlagsSelect = sql<OrganizationFlags>`${JSON.stringify(appConfig.defaultOrganizationFlags)}::jsonb || ${organizationsTable.organizationFlags}`;

/**
 * JS-side equivalent of `organizationFlagsSelect` for organization rows that don't pass through our
 * own select shapes (org-guard fetch, generic channel-entity reads, `.returning()` rows).
 */
export const withOrganizationFlagDefaults = <T extends { organizationFlags: OrganizationFlags }>(
  organization: T,
): T => ({
  ...organization,
  organizationFlags: { ...appConfig.defaultOrganizationFlags, ...organization.organizationFlags },
});
