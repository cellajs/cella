import { onlineManager } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster';
import { useUserDeleteMutation } from '~/modules/users/query';
import type { User } from '~/modules/users/types';

interface Props {
  users: User[];
  callback?: (args: CallbackArgs<User[]>) => void;
  dialog?: boolean;
}

const DeleteUsers = ({ users, callback, dialog: isDialog }: Props) => {
  const { t } = useTranslation();
  const removeDialog = useDialoger((state) => state.remove);

  const { mutate: _deleteUsers, isPending } = useUserDeleteMutation();

  const onDelete = () => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

    _deleteUsers(users, {
      onSuccess: () => {
        callback?.({ data: users, status: 'success' });
        if (isDialog) removeDialog();
      },
    });
  };

  const onCancel = () => {
    callback?.({ status: 'settle' });
    if (isDialog) removeDialog();
  };

  return <DeleteForm onDelete={onDelete} onCancel={onCancel} pending={isPending} />;
};

export default DeleteUsers;
