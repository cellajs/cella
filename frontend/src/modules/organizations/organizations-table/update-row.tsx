import { useTranslation } from 'react-i18next';
import type { Organization } from '~/types';
import UpdateOrganizationForm from '../update-organization-form';

import { Pencil } from 'lucide-react';
// import { dialog } from '../../common/dialoger/state';
import { sheet } from '~/modules/common/sheeter/state';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/modules/ui/card';

interface Props {
  organization: Organization;
  callback: (organizations: Organization[], action: 'create' | 'update' | 'delete') => void;
  tabIndex: number;
}

const UpdateRow = ({ organization, callback, tabIndex }: Props) => {
  const { t } = useTranslation();

  const openUpdateDialog = () => {
    sheet(
      <Card>
        <CardHeader>
          <CardTitle>{t('common:general')}</CardTitle>
        </CardHeader>
        <CardContent>
          <UpdateOrganizationForm organization={organization} sheet callback={(organization) => callback([organization], 'update')} />
        </CardContent>
      </Card>,
      {
        id: 'update-organization',
        className: 'max-w-full lg:max-w-4xl',
        title: t('common:edit_organization'),
      },
    );
  };

  return (
    <Button variant="cell" size="icon" tabIndex={tabIndex} className="h-full w-full" onClick={openUpdateDialog}>
      <Pencil size={16} />
    </Button>
  );
};

export default UpdateRow;
