import { useTranslation } from 'react-i18next';
import { deleteUsers } from '~/api/users';
import { User } from '~/types';

import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useApiWrapper } from '~/hooks/use-api-wrapper';
import { useUserStore } from '~/store/user';
import { DeleteForm } from '../common/delete-form';
import { dialog } from '../common/dialoger/state';

interface Props {
  users: User[];
  callback?: (users: User[]) => void;
  dialog?: boolean;
}

const DeleteUser = ({ users, callback, dialog: isDialog }: Props) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [apiWrapper, pending] = useApiWrapper();
  const { user: currentUser } = useUserStore();

  const onDelete = () => {
    apiWrapper(
      () => deleteUsers(users.map((user) => user.id)),
      () => {
        callback?.(users);

        if (users.find((user) => user.id === currentUser.id)) return navigate({ to: '/auth/sign-in' });

        if (isDialog) {
          dialog.remove();
        }

        toast.success(
          t('success.delete_users', {
            defaultValue: 'Users deleted',
          }),
        );
      },
    );
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => dialog.remove()} pending={pending} />;
};

export default DeleteUser;
