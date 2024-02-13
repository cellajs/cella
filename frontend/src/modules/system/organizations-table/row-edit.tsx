import { useTranslation } from 'react-i18next';
import { Organization } from '~/types';
import UpdateOrganizationForm from '../../organizations/update-organization-form';

import { Pencil } from 'lucide-react';
import { Button } from '~/modules/ui/button';
import { dialog } from '../../common/dialoger/state';

interface Props {
  organization: Organization;
  callback: (organizations: Organization[], action: 'create' | 'update' | 'delete') => void;
  tabIndex: number;
}

const DataTableRowEdit = ({ organization, callback, tabIndex }: Props) => {
  const { t } = useTranslation();

  const openUpdateDialog = () => {
    dialog(<UpdateOrganizationForm organization={organization} dialog callback={(organization) => callback([organization], 'update')} />, {
      drawerOnMobile: false,
      className: 'sm:max-w-2xl my-4 sm:my-8',
      title: t('action.edit_organization'),
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
