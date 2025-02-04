import type { User } from '~/types/common';

import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { queryClient } from '~/lib/router';
import { DeleteForm } from '~/modules/common/delete-form';
import { dialog } from '~/modules/common/dialoger/state';
import { usersKeys } from '~/modules/users/query';
import { useAlertStore } from '~/store/alert';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';
import { deleteSelf } from './api';

interface Props {
  callback?: (user: User) => void;
  dialog?: boolean;
}

const DeleteSelf = ({ callback, dialog: isDialog }: Props) => {
  const navigate = useNavigate();

  const { user, clearLastUser } = useUserStore();
  const { clearNavigationStore } = useNavigationStore();
  const { clearAlertStore } = useAlertStore();

  const { mutate: _deleteSelf, isPending } = useMutation({
    mutationFn: deleteSelf,
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

  const onDelete = () => {
    _deleteSelf(undefined);
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => dialog.remove()} pending={isPending} />;
};

export default DeleteSelf;
