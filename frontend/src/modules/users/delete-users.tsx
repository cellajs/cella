import { deleteUsers } from '~/api/users';
import type { User } from '~/types';

import { useApiWrapper } from '~/hooks/use-api-wrapper';
import { DeleteForm } from '../common/delete-form';
import { dialog } from '../common/dialoger/state';

interface Props {
  users: User[];
  callback?: (users: User[]) => void;
  dialog?: boolean;
}

const DeleteUsers = ({ users, callback, dialog: isDialog }: Props) => {
  const [apiWrapper, pending] = useApiWrapper();

  const onDelete = () => {
    apiWrapper(
      () => deleteUsers(users.map((user) => user.id)),
      () => {
        callback?.(users);

        if (isDialog) {
          dialog.remove();
        }
      },
    );
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => dialog.remove()} pending={pending} />;
};

export default DeleteUsers;
