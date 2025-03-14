import { Pencil } from 'lucide-react';
import { i18n } from '~/lib/i18n';

import { sheet } from '~/modules/common/sheeter/state';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import type { Organization } from '~/modules/organizations/types';
import UpdateOrganizationForm from '~/modules/organizations/update-organization-form';
import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';

interface Props {
  organization: Organization;
  callback: (organizations: Organization[]) => void;
  tabIndex: number;
}

const UpdateRow = ({ organization, callback, tabIndex }: Props) => {
  const openUpdateSheet = () => {
    sheet.create(
      <Card>
        <CardContent>
          <UpdateOrganizationForm organization={organization} sheet callback={(organization) => callback([organization])} />
        </CardContent>
      </Card>,
      {
        id: 'update-organization',
        side: 'right',
        className: 'max-w-full lg:max-w-4xl',
        title: i18n.t('common:edit_resource', { resource: i18n.t('common:organization').toLowerCase() }),
        titleContent: <UnsavedBadge title={i18n.t('common:edit_resource', { resource: i18n.t('common:organization').toLowerCase() })} />,
        scrollableOverlay: true,
      },
    );
  };

  return (
    <Button
      variant="cell"
      size="icon"
      tabIndex={tabIndex}
      className="h-full w-full"
      data-tooltip="true"
      data-tooltip-content={i18n.t('common:edit')}
      onClick={openUpdateSheet}
    >
      <Pencil size={16} />
    </Button>
  );
};

export default UpdateRow;
