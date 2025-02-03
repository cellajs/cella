import { useMutation } from '@tanstack/react-query';
import type { ApiError } from '~/lib/api';

import { t } from 'i18next';
import { queryClient } from '~/lib/router';
import { createToast } from '~/modules/common/toaster';
import { type LeaveEntityQuery, type UpdateUserParams, deleteMySessions, deleteSelf, leaveEntity, updateSelf, updateUser } from '~/modules/users/api';
import { meKeys, usersKeys } from '~/modules/users/query';
import { useUserStore } from '~/store/user';
import type { User } from '~/types/common';

export const useUpdateUserMutation = (idOrSlug?: string) => {
  const { user: currentUser } = useUserStore();
  const isSelf = currentUser.id === idOrSlug;

  return useMutation<User, ApiError, (UpdateUserParams & { idOrSlug: string }) | Omit<UpdateUserParams, 'role'>>({
    mutationKey: isSelf ? meKeys.update() : usersKeys.update(),
    mutationFn: (params) => (idOrSlug && !isSelf ? updateUser({ idOrSlug, ...params }) : updateSelf(params)),
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(usersKeys.single(updatedUser.slug), updatedUser);
    },
    gcTime: 1000 * 10,
  });
};

export const useDeleteSelfMutation = () => {
  return useMutation<void, ApiError>({
    mutationKey: usersKeys.deleteSelf(),
    mutationFn: deleteSelf,
  });
};

export const useDeleteUserMutation = () => {
  return useMutation<void, ApiError, string[]>({
    mutationKey: usersKeys.delete(),
    mutationFn: deleteSelf,
  });
};

export const useLeaveEntityMutation = () => {
  return useMutation<boolean, ApiError, LeaveEntityQuery>({
    mutationKey: usersKeys.leaveEntity(),
    mutationFn: leaveEntity,
  });
};

export const useTerminateSessionsMutation = () => {
  return useMutation<void, ApiError, string[]>({
    mutationKey: usersKeys.terminateSessions(),
    mutationFn: deleteMySessions,
    onSuccess(_, variables) {
      useUserStore.setState((state) => {
        state.user.sessions = state.user.sessions.filter((session) => !variables.includes(session.id));
      });
      createToast(
        variables.length === 1 ? t('common:success.session_terminated', { id: variables[0] }) : t('common:success.sessions_terminated'),
        'success',
      );
    },
  });
};
