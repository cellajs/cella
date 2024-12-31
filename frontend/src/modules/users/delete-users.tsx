import { deleteUsers as baseDeleteUsers } from '~/modules/users/api';
import type { User } from '~/types/common';

import { onlineManager } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useMutation } from '~/hooks/use-mutations';
import { queryClient } from '~/lib/router';
import { createToast } from '~/lib/toasts';
import { DeleteForm } from '~/modules/common/delete-form';
import { dialog } from '~/modules/common/dialoger/state';
import { usersKeys } from '~/modules/users/query';

interface Props {
  users: User[];
  callback?: (users: User[]) => void;
  dialog?: boolean;
}

const DeleteUsers = ({ users, callback, dialog: isDialog }: Props) => {
  const { t } = useTranslation();

  const { mutate: deleteUsers, isPending } = useMutation({
    mutationFn: baseDeleteUsers,
    onSuccess: () => {
      for (const user of users) {
        queryClient.invalidateQueries({
          queryKey: usersKeys.single(user.id),
        });
      }

      if (isDialog) dialog.remove();
      callback?.(users);
    },
  });

  const onDelete = () => {
    if (!onlineManager.isOnline()) return createToast(t('common:action.offline.text'), 'warning');

    deleteUsers(users.map((user) => user.id));
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => dialog.remove()} pending={isPending} />;
};

export default DeleteUsers;
