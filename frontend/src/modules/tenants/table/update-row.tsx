import i18n from 'i18next';
import { PencilIcon } from 'lucide-react';
import { type RefObject, useRef } from 'react';
import type { Tenant } from 'sdk';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import { ManageDomainsContent } from '~/modules/tenants/domains/manage-domains-sheet';
import { UpdateTenantForm } from '~/modules/tenants/update-tenant-form';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/modules/ui/card';

export function openUpdateSheet(tenant: Tenant, buttonRef: RefObject<HTMLButtonElement | null>) {
  useSheeter.getState().create(
    <div className="container w-full">
      <Card className="mb-4">
        <CardContent>
          <UpdateTenantForm tenant={tenant} sheet />
        </CardContent>
      </Card>
      <Card className="mb-20">
        <CardHeader>
          <CardTitle>{i18n.t('c:domain_other')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ManageDomainsContent tenant={tenant} />
        </CardContent>
      </Card>
    </div>,
    {
      id: 'update-tenant',
      triggerRef: buttonRef,
      side: 'right',
      className: 'max-w-full lg:max-w-4xl',
      title: i18n.t('c:edit_resource', { resource: i18n.t('c:tenant').toLowerCase() }),
      titleContent: <UnsavedBadge title={i18n.t('c:edit_resource', { resource: i18n.t('c:tenant').toLowerCase() })} />,
    },
  );
}

interface Props {
  tenant: Tenant;
  tabIndex: number;
}

export function UpdateRow({ tenant, tabIndex }: Props) {
  const buttonRef = useRef(null);

  return (
    <Button
      id={`update-${tenant.id}`}
      ref={buttonRef}
      variant="cell"
      size="cell"
      tabIndex={tabIndex}
      className="justify-center"
      data-tooltip="true"
      data-tooltip-content={i18n.t('c:edit')}
      onClick={() => openUpdateSheet(tenant, buttonRef)}
    >
      <PencilIcon />
    </Button>
  );
}
