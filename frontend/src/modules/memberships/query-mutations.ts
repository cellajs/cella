import { onlineManager, type QueryKey, useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import type { MembershipBase, MembershipInviteResponse, Organization, UpdateMembershipResponse } from 'sdk';
import { deleteMemberships, membershipInvite, updateMembership, withdrawPendingInvitation } from 'sdk';
import { getArchiveMoveOrder } from 'shared/utils/display-order';
import type { ApiError } from '~/lib/api';
import { toaster, toastOffline } from '~/modules/common/toaster/toaster';
import { channelOrganizationId } from '~/modules/entities/channel-organization-id';
import type { EnrichedChannel } from '~/modules/entities/types';
import { meKeys } from '~/modules/me/query';
import { inviteBatches, memberQueryKeys } from '~/modules/memberships/query';
import type {
  DeleteMembership,
  InviteMember,
  Member,
  MemberListSnapshot,
  MemberUpdateContext,
  MutationUpdateMembership,
} from '~/modules/memberships/types';
import { getCurrentUser } from '~/modules/user/user-store';
import { cacheUpdate } from '~/query/basic/cache-mutations';
import { getEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { invalidateOnMembershipChange } from '~/query/basic/invalidation-helpers';
import { forEachListQuery, getQueryItems, getSimilarQueries, isInfiniteQueryData, mapListItems } from '~/query/basic/mutate-query';
import { getCachedMemberships } from '~/query/enrichment/helpers';
import { queryClient } from '~/query/query-client';

const getMembershipChannelKey = (membership: Pick<MembershipBase, 'tenantId' | 'userId' | 'channelType' | 'channelId'>) =>
  [membership.tenantId, membership.userId, membership.channelType, membership.channelId].join(':');

type ApiResponseWithIncludedMembership = { included?: { membership?: MembershipBase } | null };

/** Extract API-only included membership data for seeding the myMemberships cache. */
export const getApiIncludedMembership = (entity: ApiResponseWithIncludedMembership) => entity.included?.membership;

/** Writes to myMemberships, which the global subscriber enriches entity lists from. An uncached list starts empty unless `onlyIfCached`. */
const writeMyMemberships = (write: (items: MembershipBase[]) => MembershipBase[], onlyIfCached = false) => {
  queryClient.setQueryData<{ items: MembershipBase[] }>(meKeys.memberships, (oldData) => {
    if (!oldData) return onlyIfCached ? oldData : { items: write([]) };
    return { ...oldData, items: write(oldData.items) };
  });
};

const updateMyMembershipCache = (updatedMembership: Partial<MembershipBase> & { id: string }) =>
  writeMyMemberships((items) => items.map((item) => (item.id === updatedMembership.id ? { ...item, ...updatedMembership } : item)), true);

export const addMyMembershipCache = (newMembership: MembershipBase) => writeMyMemberships((items) => [...items, newMembership]);

/**
 * Matches on channel identity, not on membership id.
 * @public
 */
export const upsertMyMembershipCache = (membership: MembershipBase) => {
  const isSameChannel = (item: MembershipBase) => getMembershipChannelKey(item) === getMembershipChannelKey(membership);
  writeMyMemberships((items) =>
    items.some(isSameChannel) ? items.map((item) => (isSameChannel(item) ? membership : item)) : [...items, membership],
  );
};

/** Maps the members of every list under `key` and returns each list's previous data for rollback. */
const patchMemberLists = (key: QueryKey, mapItems: (members: Member[]) => Member[]) => {
  const previous: MemberListSnapshot[] = [];
  forEachListQuery<Member>(key, (queryKey, data) => {
    // A list's total moves only by the rows the write drops from that list.
    const items = getQueryItems(data);
    const next = mapListItems(data, mapItems, mapItems(items).length - items.length);
    // A paged list emptied by the write collapses to one empty first page.
    const emptied = isInfiniteQueryData(next) && !getQueryItems(next).length;
    const emptyPage = { pages: [{ items: [], total: 0 }], pageParams: [{ page: 0, offset: 0 }] };
    queryClient.setQueryData(queryKey, emptied ? emptyPage : next);
    previous.push([queryKey, data]);
  });
  return previous;
};

const restoreMemberLists = (previousLists: MemberListSnapshot[] = []) => {
  for (const [queryKey, previousData] of previousLists) queryClient.setQueryData(queryKey, previousData);
};

export const useInviteMemberMutation = () =>
  useMutation<MembershipInviteResponse, ApiError, InviteMember, undefined>({
    mutationKey: memberQueryKeys.update,
    // Past the per-request limit the addresses go out in batches, one answer for all
    mutationFn: async ({ body, path, query }) => {
      const results: MembershipInviteResponse[] = [];
      for (const emails of inviteBatches(body.emails)) results.push(await membershipInvite({ body: { ...body, emails }, path, query }));
      return {
        data: results.flatMap(({ data }) => data),
        outcomes: results.flatMap(({ outcomes }) => outcomes),
        held: results.some(({ held }) => held),
      };
    },
    onSuccess: ({ data, outcomes }, { channel }) => {
      const { id: entityId, entityType, organizationId } = channel;
      // New invitations, and declined ones that opened again, are pending now; members added at once are not
      const pendingAdded = outcomes.filter(({ outcome, declinedAt }) => outcome === 'invite' || (outcome === 'remind' && declinedAt)).length;
      if (!pendingAdded && !data.length) return;

      if (pendingAdded) {
        if (entityType !== 'organization' && organizationId) {
          const orgKeys = getEntityQueryKeys('organization');
          const orgDetailQueryKey = orgKeys.detail.byId(organizationId);
          queryClient.setQueryData<Organization>(orgDetailQueryKey, (oldOrg) => updateMembershipCounts(oldOrg, pendingAdded));
        }

        const entityKeys = getEntityQueryKeys(entityType);
        const detailQueryKey = entityKeys.detail.byId(entityId);
        queryClient.setQueryData<Organization>(detailQueryKey, (oldEntity) => updateMembershipCounts(oldEntity, pendingAdded));
      }

      const entityPendingTableQueries = getSimilarQueries(memberQueryKeys.list.similarPending({ entityId, entityType }));
      for (const [queryKey] of entityPendingTableQueries) queryClient.invalidateQueries({ queryKey, refetchType: 'all' });
      invalidateOnMembershipChange(queryClient, entityType, entityId, organizationId);
    },
  });

/** Withdraws a pending invitation: its row and links go, and the channel's pending count drops by one. */
export const useWithdrawInvitationMutation = () =>
  useMutation<void, ApiError, { channel: EnrichedChannel; id: string }>({
    mutationKey: memberQueryKeys.delete,
    mutationFn: async ({ channel, id }) => {
      await withdrawPendingInvitation({ path: { tenantId: channel.tenantId, organizationId: channelOrganizationId(channel), id } });
    },
    onSuccess: (_, { channel }) => {
      const { id: entityId, entityType, organizationId } = channel;
      const detailQueryKey = getEntityQueryKeys(entityType).detail.byId(entityId);
      queryClient.setQueryData<Organization>(detailQueryKey, (oldEntity) => updateMembershipCounts(oldEntity, -1));

      const entityPendingTableQueries = getSimilarQueries(memberQueryKeys.list.similarPending({ entityId, entityType }));
      for (const [queryKey] of entityPendingTableQueries) queryClient.invalidateQueries({ queryKey, refetchType: 'all' });
      invalidateOnMembershipChange(queryClient, entityType, entityId, organizationId);
    },
  });

export const useMemberUpdateMutation = () =>
  useMutation<UpdateMembershipResponse, ApiError, MutationUpdateMembership, MemberUpdateContext>({
    mutationKey: memberQueryKeys.update,
    mutationFn: ({ path, body }) => updateMembership({ body, path }),
    onMutate: async (variables) => {
      const { channelId, channelType, path, body } = variables;
      const { tenantId, organizationId, id } = path;
      const membershipInfo = { id, ...body };

      const { archived } = body;
      const myMemberships = getCachedMemberships();
      const wasArchived = myMemberships?.find((membership) => membership.id === id)?.archived;
      if (myMemberships && archived !== undefined && archived !== wasArchived) {
        membershipInfo.displayOrder = getArchiveMoveOrder(myMemberships, channelType, archived);
      }

      const context: MemberUpdateContext = { previousLists: [], toastMessage: t('c:success.update_item', { item: t('c:membership') }) };

      if (body?.archived !== undefined) {
        context.toastMessage = t(`c:success.${body.archived ? 'archived' : 'restore'}_resource`, { resource: t(`c:${channelType}`) });
      } else if (body?.muted !== undefined) {
        context.toastMessage = t(`c:success.${body.muted ? 'mute' : 'unmute'}_resource`, { resource: t(`c:${channelType}`) });
      } else if (body?.role) {
        context.toastMessage = t('c:success.update_item', { item: t('c:role') });
      } else if (body?.displayOrder !== undefined) context.toastMessage = t('c:success.update_item', { item: t('c:order') });

      updateMyMembershipCache(membershipInfo);

      const similarKey = memberQueryKeys.list.similarMembers({ entityId: channelId, entityType: channelType, tenantId, organizationId });
      await queryClient.cancelQueries({ queryKey: similarKey });
      context.previousLists = patchMemberLists(similarKey, (members) => updateMembers(members, membershipInfo));

      return context;
    },
    onSuccess: async (updatedMembership, { channelId, channelType, path: { tenantId, organizationId } }, { toastMessage }) => {
      updateMyMembershipCache(updatedMembership);

      const similarKey = memberQueryKeys.list.similarMembers({ entityId: channelId, entityType: channelType, tenantId, organizationId });
      patchMemberLists(similarKey, (members) => updateMembers(members, updatedMembership));

      // Role-filtered lists must refetch when the role changes
      if (updatedMembership.role) {
        queryClient.invalidateQueries({
          queryKey: similarKey,
          predicate: ({ queryKey }) => queryKey.some((part) => typeof part === 'object' && part && 'role' in part && part.role),
          refetchType: 'all',
        });
      }

      invalidateOnMembershipChange(queryClient, channelType, channelId, organizationId);

      toaster.success(toastMessage);
    },
    onError: (_, __, context) => {
      // Invalidate memberships to undo the optimistic update; the enrichment subscriber rebuilds the entity lists from them.
      queryClient.invalidateQueries({ queryKey: meKeys.memberships, refetchType: 'active' });
      restoreMemberLists(context?.previousLists);
    },
  });

export const useMembershipsDeleteMutation = () =>
  useMutation<void, ApiError, DeleteMembership, MemberListSnapshot[]>({
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

      const similarKey = memberQueryKeys.list.similarMembers({ entityId, entityType, tenantId, organizationId });
      await queryClient.cancelQueries({ queryKey: similarKey });

      return patchMemberLists(similarKey, (members) => members.filter(({ id }) => !ids.includes(id)));
    },
    onSuccess: (_, { query: { entityId, entityType }, path: { organizationId } }) => {
      invalidateOnMembershipChange(queryClient, entityType, entityId, organizationId);
      toaster.success(t('c:success.delete_members'));
    },
    onError: (_, __, previousLists) => restoreMemberLists(previousLists),
  });

const updateMembers = (members: Member[], updatedMembership: { id: string } & Record<string, unknown>) =>
  members.map((member) =>
    member.membership.id === updatedMembership.id ? { ...member, membership: { ...member.membership, ...updatedMembership } } : member,
  );

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

/** Archive, mute and menu order: a response carries them on the caller's own membership only. */
const hasPersonalView = (membership: Partial<MembershipBase>): membership is MembershipBase =>
  membership.archived !== undefined && membership.muted !== undefined && membership.displayOrder !== undefined;

type ChangeEntityRoleVariables = { entity: EnrichedChannel; role: MembershipBase['role'] };

type ChangeEntityRoleResult = { entity: EnrichedChannel; membership: MembershipBase; wasNew: boolean };

export const useChangeEntityRoleMutation = () =>
  useMutation<ChangeEntityRoleResult, ApiError, ChangeEntityRoleVariables>({
    mutationFn: async ({ entity, role }) => {
      if (!onlineManager.isOnline()) {
        toastOffline();
        throw new Error('offline');
      }

      const { id: entityId, entityType, tenantId, membership } = entity;
      const organizationId = entityType === 'organization' ? entityId : entity.organizationId;
      if (!organizationId) throw new Error(`Missing organizationId for ${entityType} entity`);

      if (membership?.id) {
        const updated = await updateMembership({ body: { role }, path: { id: membership.id, tenantId, organizationId } });
        return { entity, membership: { ...membership, ...updated }, wasNew: false };
      }

      const { email } = getCurrentUser();
      const result = await membershipInvite({
        query: { entityId, entityType },
        path: { tenantId, organizationId },
        body: { emails: [email], role },
      });

      const created = result.data?.[0];
      if (!created || !hasPersonalView(created)) throw new Error('Failed to create membership');
      return { entity, membership: created, wasNew: true };
    },
    onSuccess: ({ entity, membership }) => {
      upsertMyMembershipCache(membership);

      const updatedEntity = { ...entity, membership };
      cacheUpdate(getEntityQueryKeys(entity.entityType).list.base, [updatedEntity]);

      toaster.success(t('c:success.role_updated'));
    },
  });
