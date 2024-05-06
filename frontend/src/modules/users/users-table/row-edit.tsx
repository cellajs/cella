import { useTranslation } from 'react-i18next';
import type { User } from '~/types';
import UpdateUserForm from '~/modules/users/update-user-form';

import { Pencil } from 'lucide-react';
import { Button } from '~/modules/ui/button';
import { dialog } from '../../common/dialoger/state';

interface Props {
  user: User;
  callback: (users: User[], action: 'create' | 'update' | 'delete') => void;
  tabIndex: number;
}

const RowEdit = ({ user, callback, tabIndex }: Props) => {
  const { t } = useTranslation();

  const openUpdateDialog = () => {
    dialog(<UpdateUserForm user={user} dialog callback={(user) => callback([user], 'update')} />, {
      drawerOnMobile: false,
      id: 'edit-user',
      className: 'sm:max-w-2xl my-4 sm:my-8',
      title: t('common:edit_user'),
    });
  };

  return (
    <Button variant="cell" size="icon" tabIndex={tabIndex} className="h-full w-full" onClick={openUpdateDialog}>
      <Pencil size={16} />
    </Button>
  );
};

export default RowEdit;
