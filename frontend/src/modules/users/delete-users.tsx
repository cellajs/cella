import { onlineManager } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { queryClient } from '~/lib/router';
import { DeleteForm } from '~/modules/common/delete-form';
import { dialog } from '~/modules/common/dialoger/state';
import { createToast } from '~/modules/common/toaster';
import { usersKeys } from '~/modules/users/query';
import { useDeleteUserMutation } from '~/modules/users/query-mutations';
import type { User } from '~/modules/users/types';

interface Props {
  users: User[];
  callback?: (users: User[]) => void;
  dialog?: boolean;
}

const DeleteUsers = ({ users, callback, dialog: isDialog }: Props) => {
  const { t } = useTranslation();

  const { mutate: deleteUsers, isPending } = useDeleteUserMutation();

  const onDelete = () => {
    if (!onlineManager.isOnline()) return createToast(t('common:action.offline.text'), 'warning');

    const idsToDelete = users.map((user) => user.id);
    deleteUsers(idsToDelete, {
      onSuccess: () => {
        for (const user of users) {
          queryClient.invalidateQueries({ queryKey: usersKeys.single(user.id) });
        }

        if (isDialog) dialog.remove();
        callback?.(users);
      },
    });
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => dialog.remove()} pending={isPending} />;
};

export default DeleteUsers;
