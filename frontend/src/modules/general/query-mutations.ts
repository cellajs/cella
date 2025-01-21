import { useMutation } from '@tanstack/react-query';
import type { ApiError } from '~/lib/api';

import { type AcceptInviteProps, acceptInvite, checkSlugAvailable, checkToken } from '~/modules/general/api';
import { generalKeys } from '~/modules/general/query';
import type { Entity, TokenData, UserMenu, UserMenuItem } from '~/types/common';

export const useCheckTokenMutation = () => {
  return useMutation<TokenData, ApiError, string>({
    mutationKey: generalKeys.checkToken(),
    mutationFn: checkToken,
  });
};

export const useCheckSlugMutation = () => {
  return useMutation<boolean, ApiError, { slug: string; type: Entity }>({
    mutationKey: generalKeys.checkSlug(),
    mutationFn: checkSlugAvailable,
  });
};

export const useAcceptInviteMutation = () => {
  return useMutation<{ newItem: UserMenuItem; sectionName: keyof UserMenu } | undefined, ApiError, AcceptInviteProps>({
    mutationKey: generalKeys.acceptInvite,
    mutationFn: acceptInvite,
  });
};
