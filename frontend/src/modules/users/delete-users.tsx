import { onlineManager } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useMutation } from '~/hooks/use-mutations';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster';
import { deleteUsers } from '~/modules/users/api';
import { usersKeys } from '~/modules/users/query';
import type { User } from '~/modules/users/types';
import { queryClient } from '~/query/query-client';

interface Props {
  users: User[];
  callback?: (users: User[]) => void;
  dialog?: boolean;
}

const DeleteUsers = ({ users, callback, dialog: isDialog }: Props) => {
  const { t } = useTranslation();
  const removeDialog = useDialoger((state) => state.remove);

  const { mutate: _deleteUsers, isPending } = useMutation({
    mutationKey: usersKeys.delete(),
    mutationFn: deleteUsers,
    onSuccess: () => {
      for (const user of users) {
        queryClient.invalidateQueries({ queryKey: usersKeys.single(user.id) });
      }

      if (isDialog) removeDialog();
      callback?.(users);
    },
  });

  const onDelete = () => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

    const idsToDelete = users.map((user) => user.id);
    _deleteUsers(idsToDelete);
  };

  return <DeleteForm onDelete={onDelete} onCancel={removeDialog} pending={isPending} />;
};

export default DeleteUsers;
