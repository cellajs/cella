import { useMutation } from '@tanstack/react-query';
import { config } from 'config';
import { t } from 'i18next';
import { contextEntityCacheKeys } from '~/menu-config';
import { toaster } from '~/modules/common/toaster';
import { getAndSetMenu } from '~/modules/me/helpers';
import { type RemoveMembersProps, type UpdateMembershipProp, removeMembers, updateMembership } from '~/modules/memberships/api';
import { membersKeys } from '~/modules/memberships/query/options';
import type {
  EntityMembershipContextProp,
  InfiniteMemberQueryData,
  MemberContextProp,
  MemberQueryData,
  MutationUpdateMembership,
} from '~/modules/memberships/query/types';
import type { Member, Membership } from '~/modules/memberships/types';
import { updateMenuItemMembership } from '~/modules/navigation/menu-sheet/helpers/menu-operations';
import { organizationsKeys } from '~/modules/organizations/query';
import type { Organization } from '~/modules/organizations/types';
import { formatUpdatedData, getQueryItems, getSimilarQueries } from '~/query/helpers/mutate-query';
import { useMutateQueryData } from '~/query/hooks/use-mutate-query-data';
import { queryClient } from '~/query/query-client';

const limit = config.requestLimits.members;

const onError = (_: Error, __: MutationUpdateMembership | RemoveMembersProps, context?: MemberContextProp[]) => {
  if (context?.length) {
    for (const [queryKey, previousData] of context) queryClient.setQueryData(queryKey, previousData);
  }
};

export const useMemberUpdateMutation = () =>
  useMutation<Membership, Error, MutationUpdateMembership, EntityMembershipContextProp>({
    mutationKey: membersKeys.update(),
    mutationFn: updateMembership,
    onMutate: async (variables) => {
      const { idOrSlug, entityType, orgIdOrSlug, ...membershipInfo } = variables;
      const { archived, muted, role, order } = membershipInfo;

      // Store previous query data for rollback if an error occurs
      const context = { queryContext: [] as MemberContextProp[], toastMessage: t('common:success.update_item', { item: t('common:membership') }) };

      if (archived !== undefined) {
        context.toastMessage = t(`common:success.${archived ? 'archived' : 'restore'}_resource`, { resource: t(`common:${entityType}`) });
      } else if (muted !== undefined) {
        context.toastMessage = t(`common:success.${muted ? 'mute' : 'unmute'}_resource`, { resource: t(`common:${entityType}`) });
      } else if (role) {
        context.toastMessage = t('common:success.update_item', { item: t('common:role') });

        if (entityType === 'organization') {
          // Cancel any ongoing queries for consistency
          const singleOrgKey = organizationsKeys.single.byIdOrSlug(orgIdOrSlug);

          // Cancel all affected queries
          await queryClient.cancelQueries({ queryKey: singleOrgKey });

          queryClient.setQueryData<Organization>(singleOrgKey, (oldData) => {
            context.queryContext.push([singleOrgKey, oldData]); // Store previous data for rollback if needed
            if (!oldData) return oldData;

            const membershipCounts = { ...oldData.counts.membership };

            if (role === 'admin') {
              membershipCounts.admin += 1;
              membershipCounts.member -= 1;
            }
            if (role === 'member') {
              membershipCounts.member += 1;
              membershipCounts.admin -= 1;
            }

            return { ...oldData, counts: { ...oldData.counts, membership: membershipCounts } };
          });
        }
      } else if (order !== undefined) context.toastMessage = t('common:success.update_item', { item: t('common:order') });

      // Update membership of ContextEntityType query that was fetched
      const queryKey = contextEntityCacheKeys[entityType];
      const mutateCache = useMutateQueryData(queryKey);
      mutateCache.updateMembership([membershipInfo], entityType);

      // To be able update menu offline
      updateMenuItemMembership(membershipInfo, idOrSlug, entityType);

      // Get affected queries
      const similarKey = membersKeys.table.similarMembers({ idOrSlug, entityType, orgIdOrSlug });
      //Cancel all affected queries
      await queryClient.cancelQueries({ queryKey: similarKey });
      const queries = getSimilarQueries<Member>(similarKey);

      // Iterate over affected queries and optimistically update cache
      for (const [queryKey, previousData] of queries) {
        if (!previousData) continue;

        queryClient.setQueryData<InfiniteMemberQueryData | MemberQueryData>(queryKey, (oldData) => {
          if (!oldData) return oldData;

          const prevItems = getQueryItems(oldData);
          const updatedData = updateMembers(prevItems, membershipInfo);

          return formatUpdatedData(oldData, updatedData, limit);
        });

        context.queryContext.push([queryKey, previousData, membershipInfo.id]); // Store previous data for rollback if needed
      }

      return context;
    },
    onSuccess: async (updatedMembership, { idOrSlug, entityType, orgIdOrSlug }, { toastMessage }) => {
      // Update membership of ContextEntityType query that was fetched after success
      const queryKey = contextEntityCacheKeys[entityType];
      const mutateCache = useMutateQueryData(queryKey);
      mutateCache.updateMembership([updatedMembership], entityType);

      // To update membership after success
      updateMenuItemMembership(updatedMembership, idOrSlug, entityType);

      // Get affected queries
      const similarKey = membersKeys.table.similarMembers({ idOrSlug, entityType, orgIdOrSlug });
      //Cancel all affected queries
      const queries = getSimilarQueries<Member>(similarKey);

      for (const query of queries) {
        const [activeKey] = query;

        // if role changes invalidate role based filter
        if (updatedMembership.role && activeKey.some((el) => typeof el === 'object' && el && 'role' in el && el.role)) {
          queryClient.invalidateQueries({ queryKey: activeKey });
          continue;
        }

        queryClient.setQueryData<InfiniteMemberQueryData | MemberQueryData>(activeKey, (oldData) => {
          if (!oldData) return oldData;

          const prevItems = getQueryItems(oldData);
          const updatedData = updateMembers(prevItems, updatedMembership);

          return formatUpdatedData(oldData, updatedData, limit);
        });
      }
      toaster(toastMessage, 'success');
    },
    onError: (_, __, context) => {
      getAndSetMenu();
      onError(_, __, context?.queryContext);
    },
  });

export const useMembersDeleteMutation = () =>
  useMutation<void, Error, RemoveMembersProps, MemberContextProp[]>({
    mutationKey: membersKeys.delete(),
    mutationFn: removeMembers,
    onMutate: async (variables) => {
      const { members, idOrSlug, entityType, orgIdOrSlug } = variables;
      const ids = members.map(({ id }) => id);

      const context: MemberContextProp[] = []; // previous query data for rollback if an error occurs

      // Get affected queries
      const similarKey = membersKeys.table.similarMembers({ idOrSlug, entityType, orgIdOrSlug });
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

          return formatUpdatedData(oldData, updatedMemberships, limit, -ids.length);
        });

        context.push([queryKey, previousData]); // Store previous data for rollback if needed
      }

      if (entityType === 'organization') {
        // Cancel any ongoing queries for consistency
        const singleOrgKey = organizationsKeys.single.byIdOrSlug(orgIdOrSlug);

        // Cancel all affected queries
        await queryClient.cancelQueries({ queryKey: singleOrgKey });

        queryClient.setQueryData<Organization>(singleOrgKey, (oldData) => {
          context.push([singleOrgKey, oldData]); // Store previous data for rollback if needed
          if (!oldData) return oldData;

          const initialCounts = oldData.counts.membership;

          // Count how many admins and regular users are being removed
          const { removedAdmins, removedRegularMembers } = members.reduce(
            (acc, { membership }) => {
              if (membership.role === 'admin') acc.removedAdmins++;
              if (membership.role === 'member') acc.removedRegularMembers++;
              return acc;
            },
            { removedAdmins: 0, removedRegularMembers: 0 },
          );

          const newMembershipCounts = {
            admin: Math.max(0, initialCounts.admin - removedAdmins),
            member: Math.max(0, initialCounts.member - removedRegularMembers),
            total: Math.max(0, initialCounts.total - ids.length),
            pending: initialCounts.pending,
          };

          return { ...oldData, counts: { ...oldData.counts, membership: newMembershipCounts } };
        });
      }

      return context;
    },
    onSuccess: () => toaster(t('common:success.delete_members'), 'success'),
    onError,
  });

const updateMembers = (members: Member[], variables: Omit<UpdateMembershipProp, 'idOrSlug' | 'entityType' | 'orgIdOrSlug'>) => {
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
