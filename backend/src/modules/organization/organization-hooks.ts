import type { AuthContext } from '#/core/context';
import type { OrganizationModel } from '#/modules/organization/organization-db';

/**
 * Fork hook fired after an organization update, once its config defaults are merged and before cache
 * invalidation (so a fork write is visible to the same request). Receives the request ctx, the merged
 * organization row, and the normalized update body.
 *
 * Cella ships a no-op; forks override to react to `setupConfig` changes (e.g. fan primary-label edits
 * out to child rows).
 */
export const onOrganizationUpdated = async (
  _ctx: AuthContext,
  _updated: { organization: OrganizationModel; input: Record<string, unknown> },
): Promise<void> => {};
