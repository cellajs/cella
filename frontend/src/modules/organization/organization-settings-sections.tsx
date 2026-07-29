import type { OrganizationSettingsSection } from '~/modules/organization/types';

/**
 * Fork-provided cards for the organization settings page, inserted between the built-in details and
 * delete sections and shown as page-aside tabs.
 *
 * Cella ships none; forks add their own (e.g. a primary-labels editor reading `organization.setupConfig`)
 * without patching `organization-settings`.
 */
export const organizationSettingsSections: OrganizationSettingsSection[] = [];
