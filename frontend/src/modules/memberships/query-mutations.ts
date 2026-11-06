import { onlineManager, type QueryKey, useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import type { InviteMembersResponse, MembershipBase, UpdateMembershipResponse } from 'sdk';
import { batchDeleteMemberships, deleteInvitation, inviteMembers, updateMembership } from 'sdk';
import { getArchiveMoveOrder } from 'shared/utils/display-order';
import type { ApiError } from '~/lib/api';
import { toaster, toastOffline } from '~/modules/common/toaster/toaster';
import { channelOrganizationId } from '~/modules/entities/channel-organization-id';
import type { EnrichedChannel } from '~/modules/entities/types';
import { meKeys } from '~/modules/me/query';
import { memberQueryKeys, sendInBatches } from '~/modules/memberships/query';
import type {
  DeleteMembershipsVariables,
  Member,
  MemberListSnapshot,
  MembershipInviteVariables,
  MemberUpdateContext,
  UpdateMembershipVariables,
} from '~/modules/memberships/types';
import { getCurrentUser } from '~/modules/user/user-store';
import { invalidateOnMembershipChange } from '~/query/basic/invalidation-helpers';
import { forEachListQuery, getQueryItems, getSimilarQueries, isInfiniteQueryData, mapListItems } from '~/query/basic/mutate-query';
import { findMembership, getCachedMemberships } from '~/query/enrichment/helpers';
import { queryClient } from '~/query/query-client';
import type { QueryData } from '~/query/types';

const getMembershipChannelKey = (membership: Pick<MembershipBase, 'tenantId' | 'userId' | 'channelType' | 'channelId'>) =>
  [membership.tenantId, membership.userId, membership.channelType, membership.channelId].join(':');

type ApiResponseWithIncludedMembership = { included?: { membership?: MembershipBase } | null };

/**
 * Extract API-only included membership data for seeding the myMemberships cache.
 * @public
 */
export const getApiIncludedMembership = (entity: ApiResponseWithIncludedMembership) => entity.included?.membership;

/** Writes to myMemberships, which every membership reader looks up. An uncached list starts empty unless `onlyIfCached`. */
const writeMyMemberships = (write: (items: MembershipBase[]) => MembershipBase[], onlyIfCached = false) => {
  queryClient.setQueryData<QueryData<MembershipBase>>(meKeys.memberships, (oldData) => {
    const results = write(oldData?.results ?? []);
    if (!oldData) return onlyIfCached ? oldData : { results, totalSize: results.length };
    return { ...oldData, results, totalSize: results.length };
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
    const emptyPage = { pages: [{ results: [], totalSize: 0 }], pageParams: [''] };
    queryClient.setQueryData(queryKey, emptied ? emptyPage : next);
    previous.push([queryKey, data]);
  });
  return previous;
};

const restoreMemberLists = (previousLists: MemberListSnapshot[] = []) => {
  for (const [queryKey, previousData] of previousLists) queryClient.setQueryData(queryKey, previousData);
};

/** What an invite or a withdrawal changes: the channel's pending rows, what a check answers, and its members. */
const invalidateInvites = ({ id: entityId, entityType, organizationId }: EnrichedChannel) => {
  const entityPendingTableQueries = getSimilarQueries(memberQueryKeys.list.similarPending({ entityId, entityType }));
  for (const [queryKey] of entityPendingTableQueries) queryClient.invalidateQueries({ queryKey, refetchType: 'all' });
  queryClient.invalidateQueries({ queryKey: memberQueryKeys.check(entityId) });
  invalidateOnMembershipChange(queryClient, entityType, entityId, organizationId);
};

export const useInviteMemberMutation = () =>
  useMutation<InviteMembersResponse & { unsent: string[] }, ApiError, MembershipInviteVariables, undefined>({
    mutationKey: memberQueryKeys.update,
    // Past the per-request limit the addresses go out in batches, one answer for all
    mutationFn: async ({ body, path, query }) => {
      const { results, unsent } = await sendInBatches(body.emails, (emails) => inviteMembers({ body: { ...body, emails }, path, query }));
      return {
        data: results.flatMap(({ data }) => data),
        outcomes: results.flatMap(({ outcomes }) => outcomes),
        held: results.some(({ held }) => held),
        unsent,
      };
    },
    onSuccess: (_, { channel }) => invalidateInvites(channel),
  });

/** Withdraws a pending invitation: its row and links go. */
export const useWithdrawInvitationMutation = () =>
  useMutation<void, ApiError, { channel: EnrichedChannel; id: string }>({
    mutationKey: memberQueryKeys.delete,
    mutationFn: async ({ channel, id }) => {
      await deleteInvitation({ path: { tenantId: channel.tenantId, organizationId: channelOrganizationId(channel), invitationId: id } });
    },
    onSuccess: (_, { channel }) => invalidateInvites(channel),
  });

/** A restored channel's content is not kept for offline use, so a restore needs a connection: without one this warns and answers false. */
export const canRestoreNow = () => {
  if (onlineManager.isOnline()) return true;
  toastOffline();
  return false;
};

export const useMemberUpdateMutation = () =>
  useMutation<UpdateMembershipResponse, ApiError, UpdateMembershipVariables, MemberUpdateContext>({
    mutationKey: memberQueryKeys.update,
    mutationFn: ({ path, body }) => updateMembership({ body, path }),
    onMutate: async (variables) => {
      const { channelId, channelType, path, body } = variables;
      const { tenantId, organizationId, membershipId: id } = path;
      const membershipInfo = { id, ...body };

      const { archived, displayOrder } = body;
      const myMemberships = getCachedMemberships();
      const wasArchived = myMemberships?.find((membership) => membership.id === id)?.archived;
      if (myMemberships && displayOrder === undefined && archived !== undefined && archived !== wasArchived) {
        membershipInfo.displayOrder = getArchiveMoveOrder(myMemberships, channelType, archived);
      }

      const context: MemberUpdateContext = { previousLists: [], toastMessage: t('c:success.update_resource', { resource: t('c:membership') }) };

      if (body?.archived !== undefined) {
        context.toastMessage = t(`c:success.${body.archived ? 'archive' : 'restore'}_resource`, { resource: t(`c:${channelType}`) });
      } else if (body?.muted !== undefined) {
        context.toastMessage = t(`c:success.${body.muted ? 'mute' : 'unmute'}_resource`, { resource: t(`c:${channelType}`) });
      } else if (body?.role) {
        context.toastMessage = t('c:success.update_resource', { resource: t('c:role') });
      } else if (body?.displayOrder !== undefined) context.toastMessage = t('c:success.update_resource', { resource: t('c:order') });

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
      // Invalidate memberships to undo the optimistic update.
      queryClient.invalidateQueries({ queryKey: meKeys.memberships, refetchType: 'active' });
      restoreMemberLists(context?.previousLists);
    },
  });

export const useMembershipsDeleteMutation = () =>
  useMutation<void, ApiError, DeleteMembershipsVariables, MemberListSnapshot[]>({
    mutationKey: memberQueryKeys.delete,
    mutationFn: async ({ path, body, query }) => {
      await batchDeleteMemberships({ path, body, query });
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

/** Archive, mute and menu order: a response carries them on the caller's own membership only. */
const hasPersonalView = (membership: Partial<MembershipBase>): membership is MembershipBase =>
  membership.archived !== undefined && membership.muted !== undefined && membership.displayOrder !== undefined;

type ChangeEntityRoleVariables = { entity: EnrichedChannel; role: MembershipBase['role'] };

/** Sets the caller's own role on a channel, joining it without a membership; answers the membership. */
export const useChangeEntityRoleMutation = () =>
  useMutation<MembershipBase, ApiError, ChangeEntityRoleVariables>({
    mutationFn: async ({ entity, role }) => {
      if (!onlineManager.isOnline()) {
        toastOffline();
        throw new Error('offline');
      }

      const { id: entityId, entityType, tenantId } = entity;
      const membership = findMembership(getCachedMemberships() ?? [], entityId);
      const organizationId = channelOrganizationId(entity);

      if (membership) {
        const updated = await updateMembership({ body: { role }, path: { membershipId: membership.id, tenantId, organizationId } });
        return { ...membership, ...updated };
      }

      const { email } = getCurrentUser();
      const result = await inviteMembers({
        query: { entityId, entityType },
        path: { tenantId, organizationId },
        body: { emails: [email], role },
      });

      const created = result.data?.[0];
      if (!created || !hasPersonalView(created)) throw new Error('Failed to create membership');
      return created;
    },
    onSuccess: (membership) => upsertMyMembershipCache(membership),
  });
