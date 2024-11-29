import { useMutation } from '@tanstack/react-query';
import { type RemoveMembersProps, type UpdateMembershipProp, removeMembers, updateMembership } from '~/api/memberships';

import { config } from 'config';
import { t } from 'i18next';
import { queryClient } from '~/lib/router';
import { showToast } from '~/lib/toasts';
import { membersKeys } from '~/modules/common/query-client-provider/keys';
import type { ContextProp, InfiniteQueryData, QueryData } from '~/modules/common/query-client-provider/types';
import type { Member, Membership } from '~/types/common';
import { formatUpdatedData, getCancelingRefetchQueries, getQueries, getQueryItems, handleNoOldData } from '~/utils/mutate-query';

type MemberQueryData = QueryData<Member>;
type InfiniteMemberQueryData = InfiniteQueryData<Member>;
type MemberContextProp = ContextProp<Member, string | null>;

const limit = config.requestLimits.members;

export const useMembersUpdateMutation = () => {
  return useMutation<Membership, Error, UpdateMembershipProp>({
    mutationKey: membersKeys.update(),
    mutationFn: updateMembership,
  });
};

export const useMembersDeleteMutation = () => {
  return useMutation<void, Error, RemoveMembersProps>({
    mutationKey: membersKeys.delete(),
    mutationFn: removeMembers,
  });
};

const onError = (_: Error, __: UpdateMembershipProp & RemoveMembersProps, context?: MemberContextProp[]) => {
  if (context?.length) {
    for (const [queryKey, previousData] of context) {
      queryClient.setQueryData(queryKey, previousData);
    }
  }
};

queryClient.setMutationDefaults(membersKeys.update(), {
  mutationFn: updateMembership,
  onSuccess: async (updatedMembership, { idOrSlug, entityType, orgIdOrSlug }) => {
    const exactKey = membersKeys.list({ idOrSlug, entityType, orgIdOrSlug });
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

queryClient.setMutationDefaults(membersKeys.delete(), {
  mutationFn: removeMembers,
  onMutate: async (variables) => {
    const { ids, idOrSlug, entityType, orgIdOrSlug } = variables;

    const context: MemberContextProp[] = [];
    const exactKey = membersKeys.list({ idOrSlug, entityType, orgIdOrSlug });
    const similarKey = membersKeys.similar({ idOrSlug, entityType, orgIdOrSlug });

    const queries = await getCancelingRefetchQueries<Member>(exactKey, similarKey);

    for (const [queryKey, previousData] of queries) {
      // Optimistically update to the new value
      if (previousData) {
        queryClient.setQueryData<InfiniteMemberQueryData | MemberQueryData>(queryKey, (old) => {
          if (!old) return handleNoOldData(previousData);
          const prevItems = getQueryItems(old);
          const updatedMemberships = deletedMembers(prevItems, ids);
          return formatUpdatedData(old, updatedMemberships, limit);
        });
      }
      context.push([queryKey, previousData, null]);
    }

    return context;
  },
  onSuccess: () => showToast(t('common:success.delete_members'), 'success'),
  onError,
});

function updateMembers(members: Member[], variables: Omit<UpdateMembershipProp, 'idOrSlug' | 'entityType' | 'orgIdOrSlug'>) {
  return members.map((member) => {
    // Update the task itself
    if (member.membership.id === variables.id) return { ...member, membership: { ...member.membership, ...variables } };

    // No changes, return member as-is
    return member;
  });
}

function deletedMembers(members: Member[], ids: string[]) {
  return members
    .map((member) => {
      if (ids.includes(member.id)) return null;
      return member;
    })
    .filter(Boolean) as Member[];
}
