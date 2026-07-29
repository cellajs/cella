import type { ReactNode } from 'react';
import type { Organization } from 'sdk';
import type z from 'zod';
import type { ChannelEnrichment } from '~/modules/entities/types';
import type { organizationsRouteSearchParamsSchema } from '~/modules/organization/search-params-schemas';

export type OrganizationsRouteSearchParams = z.infer<typeof organizationsRouteSearchParamsSchema>;

/** Organization with enrichment data (membership, permissions, ancestor slugs) added via cache enrichment */
export type EnrichedOrganization = Organization & ChannelEnrichment;

/**
 * An app-provided card rendered in `OrganizationSettings` between the built-in details and delete
 * sections, and surfaced as a page-aside tab. Apps declare these in `organization-settings-sections`.
 */
export interface OrganizationSettingsSection {
  /** Stable id used for the aside anchor and the tab. */
  id: string;
  /** i18n key for the tab label and the card title. */
  label: string;
  /** Optional resource i18n key passed to the tab. */
  resource?: string;
  /** Renders the card body for the given organization. */
  render: (organization: EnrichedOrganization) => ReactNode;
}
