import { useMutation } from '@tanstack/react-query';
import { config } from 'config';
import { t } from 'i18next';
import { toaster } from '~/modules/common/toaster';
import { type RemoveMembersProps, type UpdateMembershipProp, removeMembers, updateMembership } from '~/modules/memberships/api';

import { membersKeys } from '~/modules/memberships/query/options';
import type { InfiniteMemberQueryData, MemberContextProp, MemberQueryData } from '~/modules/memberships/query/types';
import type { Member, Membership } from '~/modules/memberships/types';
import { updateMenuItemMembership } from '~/modules/navigation/menu-sheet/helpers/menu-operations';
import { formatUpdatedData, getCancelingRefetchQueries, getQueries, getQueryItems } from '~/query/helpers/mutate-query';
import { queryClient } from '~/query/query-client';

const limit = config.requestLimits.members;

const onError = (_: Error, __: UpdateMembershipProp | RemoveMembersProps, context?: MemberContextProp[]) => {
  if (context?.length) {
    for (const [queryKey, previousData] of context) queryClient.setQueryData(queryKey, previousData);
  }
};

export const useMemberUpdateMutation = () =>
  useMutation<Membership, Error, UpdateMembershipProp, MemberContextProp[]>({
    mutationKey: membersKeys.update(),
    mutationFn: updateMembership,
    onMutate: async (variables) => {
      const { idOrSlug, entityType, orgIdOrSlug, ...membershipInfo } = variables;

      const context: MemberContextProp[] = []; // previous query data for rollback if an error occurs

      // Get affected queries
      const exactKey = membersKeys.table({ idOrSlug, entityType, orgIdOrSlug });
      const similarKey = membersKeys.similar({ idOrSlug, entityType, orgIdOrSlug });
      const queries = await getCancelingRefetchQueries<Member>(exactKey, similarKey);

      updateMenuItemMembership(membershipInfo, idOrSlug, entityType);

      // Iterate over affected queries and optimistically update cache
      for (const [queryKey, previousData] of queries) {
        if (!previousData) continue;

        queryClient.setQueryData<InfiniteMemberQueryData | MemberQueryData>(queryKey, (oldData) => {
          if (!oldData) return oldData;

          const prevItems = getQueryItems(oldData);
          const updatedData = updateMembers(prevItems, membershipInfo);

          return formatUpdatedData(oldData, updatedData, limit);
        });

        context.push([queryKey, previousData, membershipInfo.id]); // Store previous data for rollback if needed
      }

      return context;
    },
    onSuccess: async (updatedMembership, { idOrSlug, entityType, orgIdOrSlug }) => {
      // Get affected queries
      const exactKey = membersKeys.table({ idOrSlug, entityType, orgIdOrSlug });
      const similarKey = membersKeys.similar({ idOrSlug, entityType, orgIdOrSlug });
      const queries = getQueries<Member>(exactKey, similarKey);

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
    },
    onError,
  });

export const useMembersDeleteMutation = () =>
  useMutation<void, Error, RemoveMembersProps, MemberContextProp[]>({
    mutationKey: membersKeys.delete(),
    mutationFn: removeMembers,
    onMutate: async (variables) => {
      const { ids, idOrSlug, entityType, orgIdOrSlug } = variables;

      const context: MemberContextProp[] = []; // previous query data for rollback if an error occurs

      // Get affected queries
      const exactKey = membersKeys.table({ idOrSlug, entityType, orgIdOrSlug });
      const similarKey = membersKeys.similar({ idOrSlug, entityType, orgIdOrSlug });
      const queries = await getCancelingRefetchQueries<Member>(exactKey, similarKey);

      // Iterate over affected queries and optimistically update cache
      for (const [queryKey, previousData] of queries) {
        if (!previousData) continue;

        queryClient.setQueryData<InfiniteMemberQueryData | MemberQueryData>(queryKey, (oldData) => {
          if (!oldData) return oldData;

          const prevItems = getQueryItems(oldData);
          const updatedMemberships = deletedMembers(prevItems, ids);

          return formatUpdatedData(oldData, updatedMemberships, limit, -ids.length);
        });

        context.push([queryKey, previousData, null]); // Store previous data for rollback if needed
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
