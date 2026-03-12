import { useQuery } from '@tanstack/react-query';
import { BadgeCheckIcon, GlobeIcon, Loader2Icon, PlusIcon, Trash2Icon } from 'lucide-react';
import { type RefObject, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Domain, Tenant } from '~/api.gen';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { toaster } from '~/modules/common/toaster/toaster';
import { domainsQueryOptions, useDomainCreateMutation, useDomainDeleteMutation } from '~/modules/tenants/query';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';
import { Input } from '~/modules/ui/input';
import { dateShort } from '~/utils/date-short';

const sheetId = 'manage-domains';

interface DomainTileProps {
  domain: Domain;
  tenantId: string;
}

function DomainTile({ domain, tenantId }: DomainTileProps) {
  const { t } = useTranslation();
  const deleteMutation = useDomainDeleteMutation();

  return (
    <Card className="w-full group/tile py-0 sm:py-0 transition-all">
      <CardContent className="flex p-2! sm:p-3! items-center gap-2 sm:gap-3">
        <GlobeIcon className="size-4 sm:w-6 sm:h-6 shrink-0 opacity-50" strokeWidth={1.5} />

        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{domain.domain}</span>
            <Badge size="xs" variant={domain.verified ? 'success' : 'secondary'}>
              {domain.verified && <BadgeCheckIcon size={12} className="shrink-0" />}
              {domain.verified ? t('common:verified') : t('common:unverified')}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{dateShort(domain.createdAt)}</p>
        </div>

        <Button
          variant="plain"
          size="sm"
          className="text-sm ml-auto shrink-0"
          loading={deleteMutation.isPending}
          onClick={() => {
            deleteMutation.mutate(
              { path: { tenantId, id: domain.id } },
              {
                onSuccess: () => {
                  toaster(t('common:success.delete_resource', { resource: t('common:domain') }), 'success');
                },
              },
            );
          }}
        >
          <Trash2Icon size={16} />
          <span className="ml-1 max-sm:hidden">{t('common:remove')}</span>
        </Button>
      </CardContent>
    </Card>
  );
}

interface ManageDomainsContentProps {
  tenant: Tenant;
}

export function ManageDomainsContent({ tenant }: ManageDomainsContentProps) {
  const { t } = useTranslation();
  const [newDomain, setNewDomain] = useState('');
  const createMutation = useDomainCreateMutation();

  const { data: domains = [], isLoading } = useQuery(domainsQueryOptions(tenant.id));

  const handleAdd = () => {
    const domain = newDomain.trim().toLowerCase();
    if (!domain) return;

    createMutation.mutate(
      { path: { tenantId: tenant.id }, body: { domain } },
      {
        onSuccess: () => {
          setNewDomain('');
          toaster(t('common:success.create_resource', { resource: t('common:domain') }), 'success');
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          placeholder="example.com"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <Button onClick={handleAdd} loading={createMutation.isPending} disabled={!newDomain.trim()}>
          <PlusIcon size={16} />
          {t('common:add')}
        </Button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-4">
          <Loader2Icon className="animate-spin text-muted-foreground" size={20} />
        </div>
      )}

      {!isLoading && domains.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          {t('common:no_resource_yet', { resource: t('common:domains').toLowerCase() })}
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

export function openManageDomainsSheet(tenant: Tenant, triggerRef: RefObject<HTMLButtonElement | null>) {
  useSheeter.getState().create(
    <div className="container w-full">
      <ManageDomainsContent tenant={tenant} />
    </div>,
    {
      id: sheetId,
      triggerRef,
      side: 'right',
      className: 'max-w-full lg:max-w-xl',
      title: `${tenant.name} — domains`,
    },
  );
}
