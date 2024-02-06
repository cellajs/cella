import { useTranslation } from 'react-i18next';
import { deleteUserById } from '~/api/users';
import { User } from '~/types';

import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useApiWrapper } from '~/hooks/use-api-wrapper';
import { useUserStore } from '~/store/user';
import { DeleteForm } from '../common/delete-form';
import { dialog } from '../common/dialoger/state';

interface Props {
  user: User;
  callback?: (user: User) => void;
  dialog?: boolean;
}

const DeleteUser = ({ user, callback, dialog: isDialog }: Props) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [apiWrapper, pending] = useApiWrapper();
  const { user: currentUser } = useUserStore();
  const isSelf = currentUser.id === user.id;

  const onDelete = () => {
    apiWrapper(
      () => deleteUserById(user.id),
      () => {
        callback?.(user);

        if (isSelf) return navigate({ to: '/auth/sign-in' });

        if (isDialog) {
          dialog.remove();
        }

        toast.success(
          t('success.delete_organization', {
            defaultValue: 'User deleted',
          }),
        );
      },
    );
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => dialog.remove()} pending={pending} />;
};

export default DeleteUser;
