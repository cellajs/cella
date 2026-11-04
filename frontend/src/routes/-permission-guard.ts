import { redirect } from '@tanstack/react-router';
import type { ChannelEntityType, EntityActionType, ProductEntityType } from 'shared';
import { appConfig, checkAccess } from 'shared';
import { type CanRow, canSubject, userAccess } from '~/modules/entities/use-can';
import { myMembershipsQueryOptions } from '~/modules/me/query';
import { userStore } from '~/modules/user/user-store';
import { queryClient } from '~/query/query-client';

// Nav gating only hides links; these guards ask the engine the same question in `beforeLoad`, and the backend enforces.

export function requireSystemAdmin(): void {
  if (userStore.getState().isSystemAdmin) return;
  throw redirect({ to: appConfig.defaultRedirectPath, replace: true });
}

/**
 * Redirect unless the actor's grants on the channel and above it allow the action on the channel itself, or on a new
 * `entityType` row homed at it. The guard reads the actor's memberships itself: on a cold load they may not be cached
 * yet. Where they cannot be read (offline with none cached) the caller passes: the server decides.
 */
export async function requireEntityAction(
  channel: CanRow,
  entityType: ChannelEntityType | ProductEntityType,
  action: EntityActionType,
  redirectTo: string = appConfig.defaultRedirectPath,
): Promise<void> {
  const memberships = await queryClient.query({ ...myMembershipsQueryOptions(), staleTime: 'static' }).then(
    ({ items }) => items,
    () => null,
  );
  if (!memberships) return;

  const { user, isSystemAdmin } = userStore.getState();
  const subject = canSubject(entityType, channel);
  if (subject && checkAccess(userAccess(user, isSystemAdmin, memberships), action, subject).allowed) return;
  throw redirect({ to: redirectTo, params: true, replace: true });
}
