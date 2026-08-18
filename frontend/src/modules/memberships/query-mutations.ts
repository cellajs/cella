import { onlineManager, useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import type { Membership, MembershipBase, MembershipInviteResponse, Organization } from 'sdk';
import { deleteMemberships, membershipInvite, updateMembership } from 'sdk';
import { appConfig, type ChannelEntityType } from 'shared';
import type { ApiError } from '~/lib/api';
import { toaster } from '~/modules/common/toaster/toaster';
import type { EnrichedChannel } from '~/modules/entities/types';
import { meKeys } from '~/modules/me/query';
import { memberQueryKeys } from '~/modules/memberships/query';
import type {
  DeleteMembership,
  InfiniteMemberQueryData,
  InviteMember,
  Member,
  MemberChannelProp,
  MemberQueryData,
  MembershipChannelProp,
  MutationUpdateMembership,
} from '~/modules/memberships/types';
import { getCurrentUser } from '~/modules/user/user-store';
import { getEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { changeInfiniteQueryData, changeQueryData } from '~/query/basic/helpers';
import { invalidateOnMembershipChange } from '~/query/basic/invalidation-helpers';
import {
  formatUpdatedCacheData,
  getQueryItems,
  getSimilarQueries,
  isInfiniteQueryData,
  isQueryData,
} from '~/query/basic/mutate-query';
import { queryClient } from '~/query/query-client';

const limit = appConfig.requestLimits.members;

const getMembershipChannelKey = (
  membership: Pick<MembershipBase, 'tenantId' | 'userId' | 'channelType' | 'channelId'>,
) => [membership.tenantId, membership.userId, membership.channelType, membership.channelId].join(':');

type ApiResponseWithIncludedMembership = {
  included?: {
    membership?: MembershipBase;
  } | null;
};

/** Extract API-only included membership data for seeding the myMemberships cache. */
export const getApiIncludedMembership = (entity: ApiResponseWithIncludedMembership) => entity.included?.membership;

/** Writes to myMemberships; the global subscriber enriches entity lists from it. */
export const updateMyMembershipCache = (updatedMembership: Partial<MembershipBase> & { id: string }) => {
  queryClient.setQueryData<{ items: MembershipBase[] }>(meKeys.memberships, (oldData) => {
    if (!oldData) return oldData;
    return {
      ...oldData,
      items: oldData.items.map((m) => (m.id === updatedMembership.id ? { ...m, ...updatedMembership } : m)),
    };
  });
};

export const addMyMembershipCache = (newMembership: MembershipBase) => {
  queryClient.setQueryData<{ items: MembershipBase[] }>(meKeys.memberships, (oldData) => {
    if (!oldData) return { items: [newMembership] };
    return { ...oldData, items: [...oldData.items, newMembership] };
  });
};

/** Matches on channel identity, not on membership id. */
export const upsertMyMembershipCache = (membership: MembershipBase) => {
  const channelKey = getMembershipChannelKey(membership);
  queryClient.setQueryData<{ items: MembershipBase[] }>(meKeys.memberships, (oldData) => {
    if (!oldData) return { items: [membership] };
    const exists = oldData.items.some((m) => getMembershipChannelKey(m) === channelKey);

    return {
      ...oldData,
      items: exists
        ? oldData.items.map((m) => (getMembershipChannelKey(m) === channelKey ? membership : m))
        : [...oldData.items, membership],
    };
  });
};

/** Resolves the list query keys through the entity query registry. */
const updateEntityInListCache = (entityType: ChannelEntityType, updatedItems: { id: string }[]) => {
  const keys = getEntityQueryKeys(entityType);

  const queries = queryClient.getQueriesData({ queryKey: keys.list.base });
  for (const [queryKey, queryData] of queries) {
    if (!queryData) continue;
    if (isInfiniteQueryData(queryData)) changeInfiniteQueryData(queryKey, updatedItems, 'update');
    else if (isQueryData(queryData)) changeQueryData(queryKey, updatedItems, 'update');
  }
};

const onError = (
  _: ApiError,
  __: InviteMember | MutationUpdateMembership | DeleteMembership,
  context?: MemberChannelProp[],
) => {
  if (context?.length) {
    for (const [queryKey, previousData] of context) queryClient.setQueryData(queryKey, previousData);
  }
};

export const useInviteMemberMutation = () =>
  useMutation<MembershipInviteResponse, ApiError, InviteMember, undefined>({
    mutationKey: memberQueryKeys.update,
    mutationFn: ({ body, path, query }) => membershipInvite({ body, path, query }),
    onSuccess: ({ invitesSentCount }, { channel }) => {
      const { id: entityId, entityType, organizationId } = channel;

      if (invitesSentCount) {
        if (entityType !== 'organization' && organizationId) {
          const orgKeys = getEntityQueryKeys('organization');
          const orgDetailQueryKey = orgKeys.detail.byId(organizationId);
          queryClient.setQueryData<Organization>(orgDetailQueryKey, (oldOrg) =>
            updateMembershipCounts(oldOrg, invitesSentCount),
          );
        }

        const entityPendingTableQueries = getSimilarQueries(
          memberQueryKeys.list.similarPending({ entityId, entityType }),
        );
        for (const [queryKey] of entityPendingTableQueries)
          queryClient.invalidateQueries({ queryKey, refetchType: 'all' });

        const entityKeys = getEntityQueryKeys(entityType);
        const detailQueryKey = entityKeys.detail.byId(entityId);
        queryClient.setQueryData<Organization>(detailQueryKey, (oldEntity) =>
          updateMembershipCounts(oldEntity, invitesSentCount),
        );

        invalidateOnMembershipChange(queryClient, entityType, entityId, organizationId);
      }
    },
    onError,
  });

export const useMemberUpdateMutation = () =>
  useMutation<Membership, ApiError, MutationUpdateMembership, MembershipChannelProp>({
    mutationKey: memberQueryKeys.update,
    mutationFn: async ({ path, body }) => {
      return await updateMembership({ body, path });
    },
    onMutate: async (variables) => {
      const { channelId, channelType, path, body } = variables;
      const { tenantId, organizationId, id } = path;
      const membershipInfo = { id, ...body };

      const context = {
        queryChannel: [] as MemberChannelProp[],
        toastMessage: t('c:success.update_item', { item: t('c:membership') }),
        channelType,
      };

      if (body?.archived !== undefined) {
        context.toastMessage = t(`c:success.${body.archived ? 'archived' : 'restore'}_resource`, {
          resource: t(`c:${channelType}`),
        });
      } else if (body?.muted !== undefined) {
        context.toastMessage = t(`c:success.${body.muted ? 'mute' : 'unmute'}_resource`, {
          resource: t(`c:${channelType}`),
        });
      } else if (body?.role) {
        context.toastMessage = t('c:success.update_item', { item: t('c:role') });
      } else if (body?.displayOrder !== undefined)
        context.toastMessage = t('c:success.update_item', { item: t('c:order') });

      updateMyMembershipCache(membershipInfo);

      const similarKey = memberQueryKeys.list.similarMembers({
        entityId: channelId,
        entityType: channelType,
        tenantId,
        organizationId,
      });
      await queryClient.cancelQueries({ queryKey: similarKey });
      const queries = getSimilarQueries<Member>(similarKey);

      for (const [queryKey, previousData] of queries) {
        if (!previousData) continue;

        queryClient.setQueryData<InfiniteMemberQueryData | MemberQueryData>(queryKey, (oldData) => {
          if (!oldData) return oldData;

          const prevItems = getQueryItems(oldData);
          const updatedData = updateMembers(prevItems, membershipInfo);

          return formatUpdatedCacheData(oldData, updatedData, limit);
        });

        context.queryChannel.push([queryKey, previousData, membershipInfo.id]);
      }

      return context;
    },
    onSuccess: async (
      updatedMembership,
      { channelId, channelType, path: { tenantId, organizationId } },
      { toastMessage },
    ) => {
      updateMyMembershipCache(updatedMembership);

      const similarKey = memberQueryKeys.list.similarMembers({
        entityId: channelId,
        entityType: channelType,
        tenantId,
        organizationId,
      });
      const queries = getSimilarQueries<Member>(similarKey);

      for (const query of queries) {
        const [activeKey] = query;

        // Role-filtered lists must refetch when the role changes
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

      invalidateOnMembershipChange(queryClient, channelType, channelId, organizationId);

      toaster.success(toastMessage);
    },
    onError: (_, __, context) => {
      // Invalidate memberships to undo the optimistic update; the enrichment subscriber syncs entity lists.
      queryClient.invalidateQueries({ queryKey: meKeys.memberships, refetchType: 'active' });
      onError(_, __, context?.queryChannel);
    },
  });

export const useMembershipsDeleteMutation = () =>
  useMutation<void, ApiError, DeleteMembership, MemberChannelProp[]>({
    mutationKey: memberQueryKeys.delete,
    mutationFn: async ({ path, body, query }) => {
      await deleteMemberships({ path, body, query });
    },
    onMutate: async (variables) => {
      const {
        members,
        query: { entityId, entityType },
        path: { tenantId, organizationId },
      } = variables;
      const ids = members.map(({ id }) => id);

      const context: MemberChannelProp[] = []; // previous query data for rollback if an Apierror occurs

      const similarKey = memberQueryKeys.list.similarMembers({ entityId, entityType, tenantId, organizationId });
      await queryClient.cancelQueries({ queryKey: similarKey });
      const queries = getSimilarQueries<Member>(similarKey);

      for (const [queryKey, previousData] of queries) {
        if (!previousData) continue;

        queryClient.setQueryData<InfiniteMemberQueryData | MemberQueryData>(queryKey, (oldData) => {
          if (!oldData) return oldData;

          const prevItems = getQueryItems(oldData);
          const updatedMemberships = deletedMembers(prevItems, ids);

          return formatUpdatedCacheData(oldData, updatedMemberships, limit, -ids.length);
        });

        context.push([queryKey, previousData]);
      }

      return context;
    },
    onSuccess: (_, { query: { entityId, entityType }, path: { organizationId } }) => {
      invalidateOnMembershipChange(queryClient, entityType, entityId, organizationId);
      toaster.success(t('c:success.delete_members'));
    },
    onError,
  });

const updateMembers = (members: Member[], variables: { id: string } & Record<string, unknown>) => {
  return members.map((member) => {
    if (member.membership.id === variables.id) return { ...member, membership: { ...member.membership, ...variables } };

    return member;
  });
};

const deletedMembers = (members: Member[], ids: string[]) => {
  return members
    .map((member) => {
      if (ids.includes(member.id)) return null;
      return member;
    })
    .filter((m): m is Member => m !== null);
};

const updateMembershipCounts = (oldEntity: Organization | undefined, updateCount: number): Organization | undefined => {
  if (!oldEntity?.included.counts) return oldEntity;

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

type ChangeEntityRoleVariables = {
  entity: EnrichedChannel;
  role: MembershipBase['role'];
};

type ChangeEntityRoleResult = {
  entity: EnrichedChannel;
  membership: MembershipBase;
  wasNew: boolean;
};

export const useChangeEntityRoleMutation = () =>
  useMutation<ChangeEntityRoleResult, ApiError, ChangeEntityRoleVariables>({
    mutationFn: async ({ entity, role }) => {
      if (!onlineManager.isOnline()) {
        toaster.warning(t('c:action.offline.text'));
        throw new Error('offline');
      }

      const { id: entityId, entityType, tenantId, membership } = entity;
      // For organization entities, organizationId is the entity itself; for children it comes from the entity data
      const organizationId = entityType === 'organization' ? entityId : entity.organizationId;
      if (!organizationId) throw new Error(`Missing organizationId for ${entityType} entity`);

      if (membership?.id) {
        const updated = await updateMembership({
          body: { role },
          path: { id: membership.id, tenantId, organizationId },
        });
        return { entity, membership: updated, wasNew: false };
      }

      const { email } = getCurrentUser();
      const result = await membershipInvite({
        query: { entityId, entityType },
        path: { tenantId, organizationId },
        body: { emails: [email], role },
      });

      const created = result.data?.[0];
      if (!created) throw new Error('Failed to create membership');
      return { entity, membership: created, wasNew: true };
    },
    onSuccess: ({ entity, membership }) => {
      upsertMyMembershipCache(membership);

      const updatedEntity = { ...entity, membership };
      updateEntityInListCache(entity.entityType, [updatedEntity]);

      toaster.success(t('c:success.role_updated'));
    },
    onError: () => {
      toaster.error(t('error:error'));
    },
  });
