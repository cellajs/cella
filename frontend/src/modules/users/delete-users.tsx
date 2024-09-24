import { deleteUsers as baseDeleteUsers } from '~/api/users';
import type { User } from '~/types/common';

import { onlineManager } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useMutation } from '~/hooks/use-mutations';
import { queryClient } from '~/lib/router';
import { DeleteForm } from '~/modules/common/delete-form';
import { dialog } from '~/modules/common/dialoger/state';

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
          queryKey: ['users', user.id],
        });
      }

      if (isDialog) dialog.remove();
      callback?.(users);
    },
  });

  const onDelete = () => {
    if (!onlineManager.isOnline()) return toast.warning(t('common:action.offline.text'));

    deleteUsers(users.map((user) => user.id));
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => dialog.remove()} pending={isPending} />;
};

export default DeleteUsers;
