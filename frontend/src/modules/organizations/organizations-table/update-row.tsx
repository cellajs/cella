import { useTranslation } from 'react-i18next';
import UpdateOrganizationForm from '~/modules/organizations/update-organization-form';
import type { Organization } from '~/types/common';

import { Pencil } from 'lucide-react';
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

  const openUpdateSheet = () => {
    sheet.create(
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
        side: 'right',
        className: 'max-w-full lg:max-w-4xl',
        title: t('common:edit_resource', { resource: t('common:organization').toLowerCase() }),
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
