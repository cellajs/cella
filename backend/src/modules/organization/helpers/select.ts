import { sql } from 'drizzle-orm';
import { appConfig, type OrganizationFlags, type OrganizationSetupConfig } from 'shared';
import { organizationsTable } from '#/modules/organization/organization-db';

/** Merges config-declared defaults under the stored sparse bag, so a flag added to `defaultOrganizationFlags` later needs no backfill. */
export const organizationFlagsSelect = sql<OrganizationFlags>`${JSON.stringify(appConfig.defaultOrganizationFlags)}::jsonb || ${organizationsTable.organizationFlags}`;

/** Merges config-declared defaults under the stored sparse bag, so widening `defaultSetupConfig` later needs no backfill. */
export const setupConfigSelect = sql<OrganizationSetupConfig>`${JSON.stringify(appConfig.defaultSetupConfig)}::jsonb || ${organizationsTable.setupConfig}`;

/** JS-side equivalent of `organizationFlagsSelect` for rows that skip our select shapes (org-guard fetch, generic channel reads, `.returning()`). */
export const withOrganizationFlagDefaults = <T extends { organizationFlags: OrganizationFlags }>(
  organization: T,
): T => ({
  ...organization,
  organizationFlags: { ...appConfig.defaultOrganizationFlags, ...organization.organizationFlags },
});

/** JS-side equivalent of `setupConfigSelect` for rows that don't pass through our own select shapes. */
export const withSetupConfigDefaults = <T extends { setupConfig: Partial<OrganizationSetupConfig> }>(
  organization: T,
): T & { setupConfig: OrganizationSetupConfig } => ({
  ...organization,
  setupConfig: { ...appConfig.defaultSetupConfig, ...organization.setupConfig },
});

/** Merges both organizationFlags and setupConfig config defaults under an organization row's stored bags. */
export const withOrganizationDefaults = <
  T extends { organizationFlags: OrganizationFlags; setupConfig: Partial<OrganizationSetupConfig> },
>(
  organization: T,
): T & { setupConfig: OrganizationSetupConfig } => withSetupConfigDefaults(withOrganizationFlagDefaults(organization));
