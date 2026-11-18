import { redirect } from '@tanstack/react-router';
import type { EntityActionType, EntityType } from 'shared';
import { appConfig, isChannel } from 'shared';
import { type CanRow, canAccess, currentAccess } from '~/modules/entities/use-can';
import { userStore } from '~/modules/user/user-store';
import { channelRouteConfig } from '~/routes-config';

// Nav gating only hides links; these guards ask the engine the same question in `beforeLoad`, and the backend enforces.
// The session itself is `requireSession` in `modules/auth/route-logic.ts`.

export function requireSystemAdmin(): void {
  if (userStore.getState().isSystemAdmin) return;
  throw redirect({ to: appConfig.defaultRedirectPath, replace: true });
}

/**
 * Redirect to the channel's own page unless the actor's grants on the channel and above it allow the action on the
 * channel itself, or on a new `entityType` row homed at it (`currentAccess`: the server decides where the memberships
 * cannot be read). It asks about grants alone, never whether the channel is archived: the settings page of an archived
 * channel stays reachable to unarchive it.
 */
export async function requireEntityAction(channel: CanRow, entityType: EntityType, action: EntityActionType): Promise<void> {
  const access = await currentAccess();
  if (!access || canAccess(access, action, entityType, channel)) return;
  // The channel's page keeps the params of the route being entered; a channel without a page of its own goes home.
  const redirectTo = isChannel(channel.entityType) ? channelRouteConfig[channel.entityType].path : appConfig.defaultRedirectPath;
  throw redirect({ to: redirectTo, params: true, replace: true });
}
