import { useTranslation } from 'react-i18next';
import { Organization } from '~/types';
import UpdateOrganizationForm from '../update-organization-form';

import { Pencil } from 'lucide-react';
import { Button } from '~/modules/ui/button';
import { dialog } from '../../common/dialoger/state';

interface Props {
  organization: Organization;
  callback: (organizations: Organization[], action: 'create' | 'update' | 'delete') => void;
  tabIndex: number;
}

const RowEdit = ({ organization, callback, tabIndex }: Props) => {
  const { t } = useTranslation();

  const openUpdateDialog = () => {
    dialog(<UpdateOrganizationForm organization={organization} dialog callback={(organization) => callback([organization], 'update')} />, {
      drawerOnMobile: false,
      className: 'sm:max-w-2xl my-4 sm:my-8',
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
