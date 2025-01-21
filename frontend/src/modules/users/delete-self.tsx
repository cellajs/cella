import type { User } from '~/types/common';

import { useNavigate } from '@tanstack/react-router';
import { queryClient } from '~/lib/router';
import { DeleteForm } from '~/modules/common/delete-form';
import { dialog } from '~/modules/common/dialoger/state';
import { usersKeys } from '~/modules/users/query';
import { useDeleteSelfMutation } from '~/modules/users/query-mutations';
import { useAlertStore } from '~/store/alert';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';

interface Props {
  callback?: (user: User) => void;
  dialog?: boolean;
}

const DeleteSelf = ({ callback, dialog: isDialog }: Props) => {
  const navigate = useNavigate();
  const { user, clearLastUser } = useUserStore();
  const { clearNavigationStore } = useNavigationStore();
  const { clearAlertStore } = useAlertStore();

  const { mutate: deleteSelf, isPending } = useDeleteSelfMutation();

  const onDelete = () => {
    deleteSelf(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: usersKeys.single(user.id),
        });

        // Clear all user data
        clearLastUser();
        clearNavigationStore();
        clearAlertStore();

        navigate({ to: '/sign-out', replace: true });
        if (isDialog) dialog.remove();
        callback?.(user);
      },
    });
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => dialog.remove()} pending={isPending} />;
};

export default DeleteSelf;
