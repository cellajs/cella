import { useTranslation } from 'react-i18next';
import { User } from '~/types';

import { Pencil } from 'lucide-react';
import { Button } from '~/modules/ui/button';
import UpdateUserForm from '~/modules/users/update-user-form';
import { dialog } from '../../common/dialoger/state';

interface Props {
  user: User;
  callback: (user: User, action: 'create' | 'update' | 'delete') => void;
  tabIndex: number;
}

const DataTableRowEdit = ({ user, callback, tabIndex }: Props) => {
  const { t } = useTranslation();

  const openUpdateDialog = () => {
    dialog(<UpdateUserForm user={user} dialog callback={(user) => callback(user, 'update')} />, {
      drawerOnMobile: false,
      className: 'sm:max-w-2xl my-4 sm:my-8',
      title: t('action.edit_user'),
    });
  };

  return (
    <div className="flex h-full justify-center items-center">
      <Button variant="cell" size="icon" tabIndex={tabIndex} className="h-full w-full" onClick={openUpdateDialog}>
        <Pencil size={16} />
      </Button>
    </div>
  );
};

export default DataTableRowEdit;
