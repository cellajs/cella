import { useQuery } from '@tanstack/react-query';
import { Loader2Icon, PlusIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Tenant } from 'sdk';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { CreateDomainForm, createDomainDialogId } from '~/modules/tenants/domains/create-domain-form';
import { DomainTile } from '~/modules/tenants/domains/domain-tile';
import { domainsQueryOptions } from '~/modules/tenants/query';
import { Button } from '~/modules/ui/button';

interface ManageDomainsContentProps {
  tenant: Tenant;
}

export function ManageDomainsContent({ tenant }: ManageDomainsContentProps) {
  const { t } = useTranslation();
  const createDialog = useDialoger((state) => state.create);

  const createButtonRef = useRef(null);
  const createContainerRef = useRef(null);

  const { data: domains = [], isLoading } = useQuery(domainsQueryOptions(tenant.id));

  const openCreateDialog = () => {
    createDialog(<CreateDomainForm tenantId={tenant.id} />, {
      id: createDomainDialogId,
      triggerRef: createButtonRef,
      drawerOnMobile: false,
      className: 'w-auto shadow-none border relative z-60',
      container: { ref: createContainerRef },
      title: t('c:create_resource', { resource: t('c:domain').toLowerCase() }),
    });
  };

  return (
    <div className="relative space-y-4 pt-2">
      <Button ref={createButtonRef} onClick={openCreateDialog} className="flex gap-2">
        <PlusIcon size={16} />
        {t('c:create')}
      </Button>

      {/* Container for inline create dialog */}
      <div ref={createContainerRef} className="empty:hidden" />

      {isLoading && (
        <div className="flex justify-center py-4">
          <Loader2Icon className="animate-spin text-muted-foreground" size={20} />
        </div>
      )}

      {!isLoading && domains.length === 0 && (
        <p className="py-4 text-center text-muted-foreground text-sm">
          {t('c:no_resource_yet', { resource: t('c:domain_other').toLowerCase() })}
        </p>
      )}

      <div className="space-y-2">
        {domains.map((domain) => (
          <DomainTile key={domain.id} domain={domain} tenantId={tenant.id} />
        ))}
      </div>
    </div>
  );
}
