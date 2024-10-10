import { useTranslation } from 'react-i18next';
import UpdateUserForm from '~/modules/users/update-user-form';
import type { User } from '~/types/common';

import { Pencil } from 'lucide-react';

import { sheet } from '~/modules/common/sheeter/state';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/modules/ui/card';

interface Props {
  user: User;
  callback: (users: User[], action: 'create' | 'update' | 'delete') => void;
  tabIndex: number;
}

const UpdateRow = ({ user, callback, tabIndex }: Props) => {
  const { t } = useTranslation();

  const openUpdateSheet = () => {
    sheet.create(
      <Card>
        <CardHeader>
          <CardTitle>{t('common:general')}</CardTitle>
        </CardHeader>
        <CardContent>
          <UpdateUserForm user={user} sheet callback={(user) => callback([user], 'update')} />
        </CardContent>
      </Card>,
      {
        id: 'update-user',
        side: 'right',
        className: 'max-w-full lg:max-w-4xl',
        title: t('common:edit_resource', { resource: t('common:user').toLowerCase() }),
      },
    );
  };

  return (
    <Button variant="cell" size="icon" tabIndex={tabIndex} className="h-full w-full" onClick={openUpdateSheet}>
      <Pencil size={16} />
    </Button>
  );
};

export default UpdateRow;
