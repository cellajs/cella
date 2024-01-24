import { useTranslation } from 'react-i18next';
import { User } from '~/types';

import { Pencil, Trash } from 'lucide-react';
import { Button } from '~/components/ui/button';
import UpdateUserForm from '~/components/update-user-form';
import DeleteUserForm from '../delete-user-form';
import { dialog } from '../dialoger/state';

interface Props {
  user: User;
  callback: (user: User, action: 'create' | 'update' | 'delete') => void;
}

const DataTableRowActions = ({ user, callback }: Props) => {
  const { t } = useTranslation();

  return (
    <div className="flex">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => {
          dialog(<UpdateUserForm user={user} dialog callback={(user) => callback(user, 'update')} />, {
            drawerOnMobile: false,
            className: 'sm:max-w-2xl my-4 sm:my-8',
            title: t('action.edit_user', {
              defaultValue: 'Edit user',
            }),
          });
        }}
      >
        <Pencil size={16} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => {
          dialog(<DeleteUserForm user={user} dialog callback={(user) => callback(user, 'delete')} />, {
            className: 'sm:max-w-[64rem]',
            title: t('action.delete_user', {
              defaultValue: 'Delete user',
            }),
          });
        }}
      >
        <Trash size={16} />
      </Button>
    </div>
  );
};

export default DataTableRowActions;
