import { onlineManager } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useMutation } from '~/hooks/use-mutations';
import { queryClient } from '~/lib/router';
import { DeleteForm } from '~/modules/common/delete-form';
import { dialog } from '~/modules/common/dialoger/state';
import { toaster } from '~/modules/common/toaster';
import { deleteUsers } from '~/modules/users/api';
import { usersKeys } from '~/modules/users/query';
import type { User } from '~/modules/users/types';

interface Props {
  users: User[];
  callback?: (users: User[]) => void;
  dialog?: boolean;
}

const DeleteUsers = ({ users, callback, dialog: isDialog }: Props) => {
  const { t } = useTranslation();

  const { mutate: _deleteUsers, isPending } = useMutation({
    mutationKey: usersKeys.delete(),
    mutationFn: deleteUsers,
    onSuccess: () => {
      for (const user of users) {
        queryClient.invalidateQueries({ queryKey: usersKeys.single(user.id) });
      }

      if (isDialog) dialog.remove();
      callback?.(users);
    },
  });

  const onDelete = () => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

    const idsToDelete = users.map((user) => user.id);
    _deleteUsers(idsToDelete);
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => dialog.remove()} pending={isPending} />;
};

export default DeleteUsers;
