import { useTranslation } from 'react-i18next';
import UpdateUserForm from '~/modules/users/update-user-form';
import type { User } from '~/types';

import { Pencil } from 'lucide-react';
import { sheet } from '~/modules/common/sheeter/state';
import { Button } from '~/modules/ui/button';

interface Props {
  user: User;
  callback: (users: User[], action: 'create' | 'update' | 'delete') => void;
  tabIndex: number;
}

const RowEdit = ({ user, callback, tabIndex }: Props) => {
  const { t } = useTranslation();

  const openUpdateSheet = () => {
    sheet(<UpdateUserForm user={user} sheet callback={(user) => callback([user], 'update')} />, {
      id: 'edit-user',
      className: 'sm:max-w-2xl',
      title: t('common:edit_user'),
    });
  };

  return (
    <Button variant="cell" size="icon" tabIndex={tabIndex} className="h-full w-full" onClick={openUpdateSheet}>
      <Pencil size={16} />
    </Button>
  );
};

export default RowEdit;
