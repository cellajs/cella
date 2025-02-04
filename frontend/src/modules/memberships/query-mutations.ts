import { useMutation } from '@tanstack/react-query';
import { type RemoveMembersProps, type UpdateMembershipProp, removeMembers, updateMembership } from '~/modules/memberships/api';

import { config } from 'config';
import { t } from 'i18next';
import { queryClient } from '~/lib/router';
import { createToast } from '~/modules/common/toaster';
import { membersKeys } from '~/modules/memberships/query';
import type { Member, Membership } from '~/modules/memberships/types';
import { formatUpdatedData, getCancelingRefetchQueries, getQueries, getQueryItems, handleNoOldData } from '~/query/helpers/mutate-query';
import type { ContextProp, InfiniteQueryData, QueryData } from '~/query/types';

type MemberQueryData = QueryData<Member>;
type InfiniteMemberQueryData = InfiniteQueryData<Member>;
type MemberContextProp = ContextProp<Member, string | null>;

const limit = config.requestLimits.members;

export const useMemberUpdateMutation = () => {
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

queryClient.setMutationDefaults(membersKeys.delete(), {
  mutationFn: removeMembers,
  onMutate: async (variables) => {
    const { ids, idOrSlug, entityType, orgIdOrSlug } = variables;

    const context: MemberContextProp[] = [];
    const exactKey = membersKeys.table({ idOrSlug, entityType, orgIdOrSlug });
    const similarKey = membersKeys.similar({ idOrSlug, entityType, orgIdOrSlug });

    const queries = await getCancelingRefetchQueries<Member>(exactKey, similarKey);

    for (const [queryKey, previousData] of queries) {
      // Optimistically update to the new value
      if (previousData) {
        queryClient.setQueryData<InfiniteMemberQueryData | MemberQueryData>(queryKey, (old) => {
          if (!old) return handleNoOldData(previousData);
          const prevItems = getQueryItems(old);
          const updatedMemberships = deletedMembers(prevItems, ids);
          return formatUpdatedData(old, updatedMemberships, limit, -ids.length);
        });
      }
      context.push([queryKey, previousData, null]);
    }

    return context;
  },
  onSuccess: () => createToast(t('common:success.delete_members'), 'success'),
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
