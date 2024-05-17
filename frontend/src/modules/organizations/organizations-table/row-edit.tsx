import { useTranslation } from 'react-i18next';
import type { Organization } from '~/types';
import UpdateOrganizationForm from '../update-organization-form';

import { Pencil } from 'lucide-react';
import { Button } from '~/modules/ui/button';
// import { dialog } from '../../common/dialoger/state';
import { sheet } from '~/modules/common/sheeter/state';

interface Props {
  organization: Organization;
  callback: (organizations: Organization[], action: 'create' | 'update' | 'delete') => void;
  tabIndex: number;
}

const RowEdit = ({ organization, callback, tabIndex }: Props) => {
  const { t } = useTranslation();

  const openUpdateDialog = () => {
    sheet(<UpdateOrganizationForm organization={organization} sheet callback={(organization) => callback([organization], 'update')} />, {
      id: 'edit-organization',
      className: 'sm:max-w-2xl',
      title: t('common:edit_organization'),
    });
  };

  return (
    <Button variant="cell" size="icon" tabIndex={tabIndex} className="h-full w-full" onClick={openUpdateDialog}>
      <Pencil size={16} />
    </Button>
  );
};

export default RowEdit;
