import * as Sentry from '@sentry/react';
import { useQueryClient } from '@tanstack/react-query';
import { EntityType } from 'config';
import { attachmentQueryKeys } from '~/modules/attachments/query';
import { useSSE } from '~/modules/common/sse/use-sse';
import type { ContextEntityDataWithMembership } from '~/modules/me/types';
import { memberQueryKeys } from '~/modules/memberships/query';
import { organizationQueryKeys } from '~/modules/organizations/query';
import { pageQueryKeys } from '~/modules/pages/query';
import { userQueryKeys } from '~/modules/users/query';

/**
 * Define the types of SSE events and their corresponding data payloads.
 */

type SSEEventsMap = {
  membership_created: ContextEntityDataWithMembership;
  membership_updated: ContextEntityDataWithMembership;
  membership_deleted: { entityType: EntityType; entityId: string };
  entity_created: ContextEntityDataWithMembership;
  entity_updated: ContextEntityDataWithMembership;
  entity_deleted: { entityType: EntityType; entityId: string };
};

/**
 * Map each entity type to its corresponding query keys.
 * Add other entity types as needed.
 */
const entityKeysMap = {
  organization: organizationQueryKeys,
  page: pageQueryKeys,
  attachment: attachmentQueryKeys,
  user: userQueryKeys,
  membership: memberQueryKeys,
} as const;

/**
 * Helper to parse SSE event data and call the provided callback with typed data.
 */
const useTypedSSE = <T extends keyof SSEEventsMap>(type: T, callback: (data: SSEEventsMap[T]) => void) => {
  useSSE(type, (e: MessageEvent<string>) => {
    console.debug('SSE event received', type, e.data);

    try {
      const data = JSON.parse(e.data) as SSEEventsMap[T];
      callback(data);
    } catch (error) {
      Sentry.captureException(error);
      console.error(`Failed to parse SSE event – ${type}`, error);
    }
  });
};

/**
 * React component that listens for SSE events and invalidates or updates the React Query cache.
 */
export default function SSE() {
  const queryClient = useQueryClient();

  // Membership created: user now belongs to a new entity → invalidate its list
  const onMembershipCreated = (entityData: ContextEntityDataWithMembership) => {
    const keys = entityKeysMap[entityData.entityType];
    if (!keys) return;

    queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType: 'active' });
  };

  // Membership updated: update the single entity cache (e.g. role changed) and invalidate its list
  const onMembershipUpdated = (entityData: ContextEntityDataWithMembership) => {
    const keys = entityKeysMap[entityData.entityType];
    if (!keys) return;

    // Update the single item
    queryClient.setQueryData(keys.detail.byIdOrSlug(entityData.id), entityData);

    // And mark the list stale
    queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType: 'active' });
  };

  // Membership deleted: user no longer belongs to the entity → remove single cache and invalidate list
  const onMembershipDeleted = ({ entityType, entityId }: { entityType: EntityType; entityId: string }) => {
    const keys = entityKeysMap[entityType];
    if (!keys) return;

    queryClient.removeQueries({ queryKey: keys.detail.byIdOrSlug(entityId), exact: true });
    queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType: 'active' });
  };

  // Entity created: a new entity was created → invalidate its list (if the creator immediately becomes a member)
  const onEntityCreated = (entityData: ContextEntityDataWithMembership) => {
    const keys = entityKeysMap[entityData.entityType];
    if (!keys) return;

    queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType: 'active' });
  };

  // Entity updated: update the single cache and invalidate list (e.g. name or avatar changed)
  const onEntityUpdated = (entityData: ContextEntityDataWithMembership) => {
    console.debug('Entity updated', entityData);
    const keys = entityKeysMap[entityData.entityType];
    if (!keys) return;

    queryClient.setQueryData(keys.detail.byIdOrSlug(entityData.id), entityData);
    queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType: 'active' });
  };

  // Entity deleted: remove its caches
  const onEntityDeleted = ({ entityType, entityId }: { entityType: EntityType; entityId: string }) => {
    const keys = entityKeysMap[entityType];
    if (!keys) return;

    queryClient.removeQueries({ queryKey: keys.detail.byIdOrSlug(entityId), exact: true });
    queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType: 'active' });
  };

  useTypedSSE('membership_created', onMembershipCreated);
  useTypedSSE('membership_updated', onMembershipUpdated);
  useTypedSSE('membership_deleted', onMembershipDeleted);
  useTypedSSE('entity_created', onEntityCreated);
  useTypedSSE('entity_updated', onEntityUpdated);
  useTypedSSE('entity_deleted', onEntityDeleted);

  return null;
}
