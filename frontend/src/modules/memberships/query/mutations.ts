import { useMutation } from '@tanstack/react-query';
import { type RemoveMembersProps, type UpdateMembershipProp, removeMembers, updateMembership } from '~/modules/memberships/api';

import { membersKeys } from '~/modules/memberships/query/options';
import type { Membership } from '~/modules/memberships/types';

export const useMemberUpdateMutation = () =>
  useMutation<Membership, Error, UpdateMembershipProp>({
    mutationKey: membersKeys.update(),
    mutationFn: updateMembership,
  });

export const useMembersDeleteMutation = () =>
  useMutation<void, Error, RemoveMembersProps>({
    mutationKey: membersKeys.delete(),
    mutationFn: removeMembers,
  });
