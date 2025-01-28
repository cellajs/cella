import { useMutation } from '@tanstack/react-query';
import type { ApiError } from '~/lib/api';

import { type AcceptOrgInviteProps, acceptOrgInvite, checkToken } from '~/modules/auth/api';
import { checkSlugAvailable } from '~/modules/general/api';
import { generalKeys } from '~/modules/general/query';
import type { Entity, TokenData, UserMenu, UserMenuItem } from '~/types/common';

export const useCheckSlugMutation = () => {
  return useMutation<boolean, ApiError, { slug: string; type: Entity }>({
    mutationKey: generalKeys.checkSlug(),
    mutationFn: checkSlugAvailable,
  });
};

export const useCheckTokenMutation = () => {
  return useMutation<TokenData, ApiError, { id: string }>({
    mutationKey: generalKeys.checkToken(),
    mutationFn: checkToken,
  });
};

export const useAcceptOrgInviteMutation = () => {
  return useMutation<{ newItem: UserMenuItem; sectionName: keyof UserMenu } | undefined, ApiError, AcceptOrgInviteProps>({
    mutationKey: generalKeys.acceptOrgInvite,
    mutationFn: acceptOrgInvite,
  });
};
