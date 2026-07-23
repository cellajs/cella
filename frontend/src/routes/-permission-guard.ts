import { redirect } from '@tanstack/react-router';
import type { ChannelEntityType, EntityActionType, EntityType } from 'shared';
import { appConfig, resolveCan } from 'shared';
import { useUserStore } from '~/modules/user/user-store';
import { enrichWithPermissions } from '~/query/enrichment/permissions';
import type { EnrichableChannel } from '~/query/enrichment/types';

/**
 * Route-level permission guards. Nav gating only hides LINKS; a direct URL still renders the
 * page and leaves enforcement to the backend. These guards give routes the same `can`-derived
 * answer in `beforeLoad`, so a denied visitor is redirected before reaching a 403 affordance.
 */

/** Throw a redirect unless the current user is a system admin (system panel surfaces). */
export function requireSystemAdmin(): void {
  if (useUserStore.getState().isSystemAdmin) return;
  throw redirect({ to: appConfig.defaultRedirectPath, replace: true });
}

/** Redirect unless cache-equivalent policy derivation allows the action, including own-row grants. */
export function requireEntityAction(
  entity: EnrichableChannel & { createdBy?: string | { id: string } | null },
  channelType: ChannelEntityType,
  entityType: EntityType,
  action: EntityActionType,
  redirectTo: string = appConfig.defaultRedirectPath,
): void {
  const enriched = enrichWithPermissions(entity, channelType);
  const createdBy = typeof entity.createdBy === 'string' ? entity.createdBy : (entity.createdBy?.id ?? null);
  const allowed = resolveCan(enriched.can?.[entityType]?.[action], createdBy, useUserStore.getState().user?.id);
  if (allowed) return;
  throw redirect({ to: redirectTo, params: true, replace: true });
}
