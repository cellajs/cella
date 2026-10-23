import { redirect } from '@tanstack/react-router';
import type { ActorRef } from 'sdk';
import type { ChannelEntityType, EntityActionType, EntityType } from 'shared';
import { appConfig, resolveCan } from 'shared';
import { myMembershipsQueryOptions } from '~/modules/me/query';
import { userStore } from '~/modules/user/user-store';
import { enrichWithMembership } from '~/query/enrichment/membership';
import { enrichWithPermissions } from '~/query/enrichment/permissions';
import type { EnrichableChannel } from '~/query/enrichment/types';
import { queryClient } from '~/query/query-client';

// Nav gating only hides links; these guards apply the same `can` answer in `beforeLoad`, and the backend enforces.

export function requireSystemAdmin(): void {
  if (userStore.getState().isSystemAdmin) return;
  throw redirect({ to: appConfig.defaultRedirectPath, replace: true });
}

/**
 * Redirect unless the actor's grants on the channel and above it allow the action, including own-row grants. The guard
 * reads the actor's memberships itself: on a cold load the row is the API's own, and the memberships that enrich it load
 * after every `beforeLoad`. Where they cannot be read (offline with none cached) the caller passes: the page shows what
 * its `can` map allows once they load, and the server decides.
 */
export async function requireEntityAction(
  entity: EnrichableChannel & { createdBy?: ActorRef | null },
  channelType: ChannelEntityType,
  entityType: EntityType,
  action: EntityActionType,
  redirectTo: string = appConfig.defaultRedirectPath,
): Promise<void> {
  const memberships = await queryClient.query({ ...myMembershipsQueryOptions(), staleTime: 'static' }).then(
    ({ items }) => items,
    () => null,
  );
  if (!memberships) return;

  // The row's own membership comes from the same list: the row may not carry it yet.
  const enriched = enrichWithPermissions(enrichWithMembership(entity, memberships), channelType, memberships);
  // The guard asks about the channel itself or rows placed at it, so the row's home is the channel.
  const home = { row: entity.id, channel: entity.id };
  const allowed = resolveCan(enriched.can?.[entityType]?.[action], entity.createdBy?.id ?? null, userStore.getState().user?.id, home);
  if (allowed) return;
  throw redirect({ to: redirectTo, params: true, replace: true });
}
