import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { appConfig } from 'shared';
import {
  deleteMemberships,
  type MembershipBase,
  type MembershipInviteResponse,
  membershipInvite,
  updateMembership,
} from '~/api.gen';
import type { ApiError } from '~/lib/api';
import { toaster } from '~/modules/common/toaster/service';
import type { ContextEntityData } from '~/modules/entities/types';
import { meKeys } from '~/modules/me/query';
import { memberQueryKeys } from '~/modules/memberships/query';
import type {
  DeleteMembership,
  EntityMembershipContextProp,
  InfiniteMemberQueryData,
  InviteMember,
  Member,
  MemberContextProp,
  MemberQueryData,
  Membership,
  MutationUpdateMembership,
} from '~/modules/memberships/types';
import { getMenuData } from '~/modules/navigation/menu-sheet/helpers';
import {
  formatUpdatedCacheData,
  getEntityQueryKeys,
  getQueryItems,
  getSimilarQueries,
  invalidateOnMembershipChange,
} from '~/query/basic';
import { queryClient } from '~/query/query-client';

const limit = appConfig.requestLimits.members;

/**
 * Update a membership in the myMemberships cache.
 * This is the single source of truth for current user's memberships.
 */
const updateMyMembershipCache = (updatedMembership: Partial<MembershipBase> & { id: string }) => {
  queryClient.setQueryData<{ items: MembershipBase[] }>(meKeys.memberships, (oldData) => {
    if (!oldData) return oldData;
    return {
      ...oldData,
      items: oldData.items.map((m) => (m.id === updatedMembership.id ? { ...m, ...updatedMembership } : m)),
    };
  });
};

const onError = (
  _: ApiError,
  __: InviteMember | MutationUpdateMembership | DeleteMembership,
  context?: MemberContextProp[],
) => {
  if (context?.length) {
    for (const [queryKey, previousData] of context) queryClient.setQueryData(queryKey, previousData);
  }
};

export const useInviteMemberMutation = () =>
  useMutation<MembershipInviteResponse, ApiError, InviteMember, undefined>({
    mutationKey: memberQueryKeys.update(),
    mutationFn: ({ entity, ...body }) =>
      membershipInvite({
        body,
        query: { entityId: entity.id, entityType: entity.entityType },
        path: { tenantId: entity.tenantId, orgIdOrSlug: entity.organizationId || entity.id },
      }),
    onSuccess: ({ invitesSentCount }, { entity }) => {
      const { id: entityId, entityType, organizationId } = entity;

      if (invitesSentCount) {
        // If the entity is not an organization but belongs to one, update its cache too
        if (entityType !== 'organization' && organizationId) {
          const orgKeys = getEntityQueryKeys('organization');
          if (orgKeys) {
            const orgDetailQueryKey = orgKeys.detail.byId(organizationId);
            queryClient.setQueryData<ContextEntityData>(orgDetailQueryKey, (oldOrg) => {
              if (!oldOrg?.included?.counts) return oldOrg;
              return updateMembershipCounts(oldOrg, invitesSentCount);
            });
          }
        }

        const entityPendingTableQueries = getSimilarQueries(
          memberQueryKeys.list.similarPending({ entityId, entityType }),
        );
        for (const [queryKey] of entityPendingTableQueries)
          queryClient.invalidateQueries({ queryKey, refetchType: 'all' });

        // Update entity detail cache using the proper query key
        const entityKeys = getEntityQueryKeys(entityType);
        if (entityKeys) {
          const detailQueryKey = entityKeys.detail.byId(entityId);
          queryClient.setQueryData<ContextEntityData>(detailQueryKey, (oldEntity) => {
            if (!oldEntity?.included?.counts) return oldEntity;
            return updateMembershipCounts(oldEntity, invitesSentCount);
          });
        }

        // Invalidate entity detail/list queries to ensure fresh data
        invalidateOnMembershipChange(queryClient, entityType, entityId, organizationId);
      }
    },
    onError,
  });

export const useMemberUpdateMutation = () =>
  useMutation<Membership, ApiError, MutationUpdateMembership, EntityMembershipContextProp>({
    mutationKey: memberQueryKeys.update(),
    mutationFn: async ({ id, tenantId, orgIdOrSlug, entityType, entityId, ...body }) => {
      return await updateMembership({ body, path: { id, tenantId, orgIdOrSlug } });
    },
    onMutate: async (variables) => {
      const { entityId, entityType, tenantId, orgIdOrSlug, ...membershipInfo } = variables;
      const { archived, muted, role, displayOrder } = membershipInfo;

      // Store previous query data for rollback if an Apierror occurs
      const context = {
        queryContext: [] as MemberContextProp[],
        toastMessage: t('common:success.update_item', { item: t('common:membership') }),
      };

      // Set toast message based on what was updated
      if (archived !== undefined) {
        context.toastMessage = t(`common:success.${archived ? 'archived' : 'restore'}_resource`, {
          resource: t(`common:${entityType}`),
        });
      } else if (muted !== undefined) {
        context.toastMessage = t(`common:success.${muted ? 'mute' : 'unmute'}_resource`, {
          resource: t(`common:${entityType}`),
        });
      } else if (role) {
        context.toastMessage = t('common:success.update_item', { item: t('common:role') });
      } else if (displayOrder !== undefined)
        context.toastMessage = t('common:success.update_item', { item: t('common:order') });

      // Update membership in the separate myMemberships cache
      updateMyMembershipCache(membershipInfo);

      // Get affected queries
      const similarKey = memberQueryKeys.list.similarMembers({ entityId, entityType, tenantId, orgIdOrSlug });
      // Cancel all affected queries
      await queryClient.cancelQueries({ queryKey: similarKey });
      const queries = getSimilarQueries<Member>(similarKey);

      // Iterate over affected queries and optimistically update cache
      for (const [queryKey, previousData] of queries) {
        if (!previousData) continue;

        queryClient.setQueryData<InfiniteMemberQueryData | MemberQueryData>(queryKey, (oldData) => {
          if (!oldData) return oldData;

          const prevItems = getQueryItems(oldData);
          const updatedData = updateMembers(prevItems, membershipInfo);

          return formatUpdatedCacheData(oldData, updatedData, limit);
        });

        context.queryContext.push([queryKey, previousData, membershipInfo.id]); // Store previous data for rollback if needed
      }

      return context;
    },
    onSuccess: async (updatedMembership, { entityId, entityType, tenantId, orgIdOrSlug }, { toastMessage }) => {
      // Update membership in the separate myMemberships cache with server response
      updateMyMembershipCache(updatedMembership);

      // Get affected queries
      const similarKey = memberQueryKeys.list.similarMembers({ entityId, entityType, tenantId, orgIdOrSlug });
      //Cancel all affected queries
      const queries = getSimilarQueries<Member>(similarKey);

      for (const query of queries) {
        const [activeKey] = query;

        // if role changes invalidate role based filter
        if (updatedMembership.role && activeKey.some((el) => typeof el === 'object' && el && 'role' in el && el.role)) {
          queryClient.invalidateQueries({ queryKey: activeKey, refetchType: 'all' });
          continue;
        }

        queryClient.setQueryData<InfiniteMemberQueryData | MemberQueryData>(activeKey, (oldData) => {
          if (!oldData) return oldData;

          const prevItems = getQueryItems(oldData);
          const updatedData = updateMembers(prevItems, updatedMembership);

          return formatUpdatedCacheData(oldData, updatedData, limit);
        });
      }

      // Invalidate entity queries to ensure counts and data are fresh
      invalidateOnMembershipChange(queryClient, entityType, entityId, orgIdOrSlug);

      toaster(toastMessage, 'success');
    },
    onError: (_, __, context) => {
      getMenuData();
      onError(_, __, context?.queryContext);
    },
  });

export const useMembershipsDeleteMutation = () =>
  useMutation<void, ApiError, DeleteMembership, MemberContextProp[]>({
    mutationKey: memberQueryKeys.delete(),
    mutationFn: async ({ entityId, entityType, tenantId, orgIdOrSlug, members }) => {
      const ids = members.map(({ id }) => id);
      await deleteMemberships({ query: { entityId, entityType }, body: { ids }, path: { tenantId, orgIdOrSlug } });
    },
    onMutate: async (variables) => {
      const { members, entityId, entityType, tenantId, orgIdOrSlug } = variables;
      const ids = members.map(({ id }) => id);

      const context: MemberContextProp[] = []; // previous query data for rollback if an Apierror occurs

      // Get affected queries
      const similarKey = memberQueryKeys.list.similarMembers({ entityId, entityType, tenantId, orgIdOrSlug });
      //Cancel all affected queries
      await queryClient.cancelQueries({ queryKey: similarKey });
      const queries = getSimilarQueries<Member>(similarKey);

      // Iterate over affected queries and optimistically update cache
      for (const [queryKey, previousData] of queries) {
        if (!previousData) continue;

        queryClient.setQueryData<InfiniteMemberQueryData | MemberQueryData>(queryKey, (oldData) => {
          if (!oldData) return oldData;

          const prevItems = getQueryItems(oldData);
          const updatedMemberships = deletedMembers(prevItems, ids);

          return formatUpdatedCacheData(oldData, updatedMemberships, limit, -ids.length);
        });

        context.push([queryKey, previousData]); // Store previous data for rollback if needed
      }

      return context;
    },
    onSuccess: (_, { entityId, entityType, orgIdOrSlug }) => {
      // Invalidate entity queries to ensure counts are fresh
      invalidateOnMembershipChange(queryClient, entityType, entityId, orgIdOrSlug);
      toaster(t('common:success.delete_members'), 'success');
    },
    onError,
  });

const updateMembers = (
  members: Member[],
  variables: Pick<MutationUpdateMembership, 'id'> & Partial<MutationUpdateMembership>,
) => {
  return members.map((member) => {
    // Update the task itself
    if (member.membership.id === variables.id) return { ...member, membership: { ...member.membership, ...variables } };

    // No changes, return member as-is
    return member;
  });
};

const deletedMembers = (members: Member[], ids: string[]) => {
  return members
    .map((member) => {
      if (ids.includes(member.id)) return null;
      return member;
    })
    .filter(Boolean) as Member[];
};

/**
 * Update the memberships and pending membership count in the cache for a given entity.
 */
const updateMembershipCounts = (
  oldEntity: ContextEntityData | undefined,
  updateCount: number,
): ContextEntityData | undefined => {
  if (!oldEntity?.included?.counts) return oldEntity;

  return {
    ...oldEntity,
    included: {
      ...oldEntity.included,
      counts: {
        ...oldEntity.included.counts,
        membership: {
          ...oldEntity.included.counts.membership,
          pending: (oldEntity.included.counts.membership.pending ?? 0) + updateCount,
        },
      },
    },
  };
};
