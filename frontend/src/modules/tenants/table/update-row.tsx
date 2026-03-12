import i18n from 'i18next';
import { PencilIcon } from 'lucide-react';
import { type RefObject, useRef } from 'react';
import type { Tenant } from '~/api.gen';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import { UpdateTenantForm } from '~/modules/tenants/update-tenant-form';
import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';

export function openUpdateSheet(tenant: Tenant, buttonRef: RefObject<HTMLButtonElement | null>) {
  useSheeter.getState().create(
    <div className="container w-full">
      <Card className="mb-20">
        <CardContent>
          <UpdateTenantForm tenant={tenant} sheet />
        </CardContent>
      </Card>
    </div>,
    {
      id: 'update-tenant',
      triggerRef: buttonRef,
      side: 'right',
      className: 'max-w-full lg:max-w-xl',
      title: i18n.t('common:edit_resource', { resource: i18n.t('common:tenant').toLowerCase() }),
      titleContent: (
        <UnsavedBadge title={i18n.t('common:edit_resource', { resource: i18n.t('common:tenant').toLowerCase() })} />
      ),
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
      data-tooltip-content={i18n.t('common:edit')}
      onClick={() => openUpdateSheet(tenant, buttonRef)}
    >
      <PencilIcon size={16} />
    </Button>
  );
}
