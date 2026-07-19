import { redirect } from '@tanstack/react-router';
import type { ChannelEntityType, EntityActionType, EntityType } from 'shared';
import { appConfig, resolvePermission } from 'shared';
import { useUserStore } from '~/modules/user/user-store';
import { enrichWithPermissions } from '~/query/enrichment/permissions';
import type { EnrichableEntity } from '~/query/enrichment/types';

/**
 * Route-level permission guards. Nav gating (tab `requires` grants, `isSystemAdmin` links)
 * only hides LINKS — a direct URL still renders the page and leaves enforcement to the
 * backend. These guards give routes the same `can`-derived answer in `beforeLoad`, so a
 * denied visitor is redirected instead of being shown affordances every request would 403.
 */

/** Throw a redirect unless the current user is a system admin (system panel surfaces). */
export function requireSystemAdmin(): void {
  if (useUserStore.getState().isSystemAdmin) return;
  throw redirect({ to: appConfig.defaultRedirectPath, replace: true });
}

/**
 * Throw a redirect unless the user may perform `action` on `entityType` at this channel
 * entity. Permissions come from the SAME derivation the cache enrichment uses
 * (`enrichWithPermissions`: membership + accessPolicies, system-admin bypass), with `'own'`
 * resolved against the entity's creator — so route guards can never disagree with the
 * affordances the page renders.
 */
export function requireEntityAction(
  entity: EnrichableEntity & { createdBy?: string | { id: string } | null },
  channelType: ChannelEntityType,
  entityType: EntityType,
  action: EntityActionType,
  redirectTo: string = appConfig.defaultRedirectPath,
): void {
  const enriched = enrichWithPermissions(entity, channelType);
  const createdBy = typeof entity.createdBy === 'string' ? entity.createdBy : (entity.createdBy?.id ?? null);
  const allowed = resolvePermission(enriched.can?.[entityType]?.[action], createdBy, useUserStore.getState().user?.id);
  if (allowed) return;
  throw redirect({ to: redirectTo, params: true, replace: true });
}
