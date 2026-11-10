import { redirect } from '@tanstack/react-router';
import type { ChannelEntityType, EntityActionType, ProductEntityType } from 'shared';
import { appConfig, checkAccess, isChannel } from 'shared';
import { type CanRow, canSubject, userAccess } from '~/modules/entities/use-can';
import { myMembershipsQueryOptions } from '~/modules/me/query';
import { userStore } from '~/modules/user/user-store';
import { queryClient } from '~/query/query-client';
import { channelRouteConfig } from '~/routes-config';

// Nav gating only hides links; these guards ask the engine the same question in `beforeLoad`, and the backend enforces.
// The session itself is `requireSession` in `modules/auth/route-logic.ts`.

export function requireSystemAdmin(): void {
  if (userStore.getState().isSystemAdmin) return;
  throw redirect({ to: appConfig.defaultRedirectPath, replace: true });
}

/**
 * Redirect to the channel's own page unless the actor's grants on the channel and above it allow the action on the
 * channel itself, or on a new `entityType` row homed at it. The guard reads the actor's memberships itself: on a cold
 * load they may not be cached yet. Where they cannot be read (offline with none cached) the caller passes: the server
 * decides. It asks about grants alone, never whether the channel is archived, so the settings page of an archived
 * channel stays reachable to unarchive it.
 */
export async function requireEntityAction(
  channel: CanRow,
  entityType: ChannelEntityType | ProductEntityType,
  action: EntityActionType,
): Promise<void> {
  const memberships = await queryClient.query({ ...myMembershipsQueryOptions(), staleTime: 'static' }).then(
    ({ results }) => results,
    () => null,
  );
  if (!memberships) return;

  const { user, isSystemAdmin } = userStore.getState();
  const subject = canSubject(entityType, channel);
  if (subject && checkAccess(userAccess(user, isSystemAdmin, memberships), action, subject).allowed) return;
  // The channel's page keeps the params of the route being entered; a channel without a page of its own goes home.
  const redirectTo = isChannel(channel.entityType) ? channelRouteConfig[channel.entityType].path : appConfig.defaultRedirectPath;
  throw redirect({ to: redirectTo, params: true, replace: true });
}
