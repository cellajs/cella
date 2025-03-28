import { Pencil } from 'lucide-react';
import { type RefObject, useRef } from 'react';
import { i18n } from '~/lib/i18n';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import type { Organization } from '~/modules/organizations/types';
import UpdateOrganizationForm from '~/modules/organizations/update-organization-form';
import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';

interface Props {
  organization: Organization;
  tabIndex: number;
}

const openUpdateSheet = (organization: Organization, buttonRef: RefObject<HTMLButtonElement | null>) => {
  useSheeter.getState().create(
    <Card>
      <CardContent>
        <UpdateOrganizationForm organization={organization} sheet />
      </CardContent>
    </Card>,
    {
      id: 'update-organization',
      triggerRef: buttonRef,
      side: 'right',
      className: 'max-w-full lg:max-w-4xl',
      title: i18n.t('common:edit_resource', { resource: i18n.t('common:organization').toLowerCase() }),
      titleContent: <UnsavedBadge title={i18n.t('common:edit_resource', { resource: i18n.t('common:organization').toLowerCase() })} />,
      scrollableOverlay: true,
    },
  );
};

const UpdateRow = ({ organization, tabIndex }: Props) => {
  const buttonRef = useRef(null);

  return (
    <Button
      id={`update-${organization.id}`}
      ref={buttonRef}
      variant="cell"
      size="icon"
      tabIndex={tabIndex}
      className="h-full w-full"
      data-tooltip="true"
      data-tooltip-content={i18n.t('common:edit')}
      onClick={() => openUpdateSheet(organization, buttonRef)}
    >
      <Pencil size={16} />
    </Button>
  );
};

export default UpdateRow;
