import { deleteUsers as baseDeleteUsers } from '~/api/users';
import type { User } from '~/types';

import { useMutation } from '~/hooks/use-mutations';
import { queryClient } from '~/lib/router';
import { DeleteForm } from '../common/delete-form';
import { dialog } from '../common/dialoger/state';

interface Props {
  users: User[];
  callback?: (users: User[]) => void;
  dialog?: boolean;
}

const DeleteUsers = ({ users, callback, dialog: isDialog }: Props) => {
  const { mutate: deleteUsers, isPending } = useMutation({
    mutationFn: baseDeleteUsers,
    onSuccess: () => {
      for (const user of users) {
        queryClient.invalidateQueries({
          queryKey: ['users', user.id],
        });
      }

      callback?.(users);

      if (isDialog) dialog.remove();
    },
  });

  const onDelete = () => {
    deleteUsers(users.map((user) => user.id));
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => dialog.remove()} pending={isPending} />;
};

export default DeleteUsers;
