import { useQuery } from '@tanstack/react-query';
import {
  BadgeCheckIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  GlobeIcon,
  Loader2Icon,
  PlusIcon,
  SearchCheckIcon,
  Trash2Icon,
} from 'lucide-react';
import { type RefObject, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DomainWithToken, Tenant, VerifyDomainResponse } from '~/api.gen';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { toaster } from '~/modules/common/toaster/toaster';
import {
  domainsQueryOptions,
  useDomainCreateMutation,
  useDomainDeleteMutation,
  useDomainVerifyMutation,
} from '~/modules/tenants/query';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/modules/ui/collapsible';
import { Input } from '~/modules/ui/input';
import { dateShort } from '~/utils/date-short';

const sheetId = 'manage-domains';

interface DomainTileProps {
  domain: DomainWithToken;
  tenantId: string;
}

function DomainTile({ domain, tenantId }: DomainTileProps) {
  const { t } = useTranslation();
  const deleteMutation = useDomainDeleteMutation();
  const verifyMutation = useDomainVerifyMutation();
  const { copied: hostCopied, copyToClipboard: copyHost } = useCopyToClipboard();
  const { copied: valueCopied, copyToClipboard: copyValue } = useCopyToClipboard();
  const [verifyResult, setVerifyResult] = useState<VerifyDomainResponse | null>(null);

  const txtHost = `_cella-verification.${domain.domain}`;
  const txtValue = domain.verificationToken ?? domain.id;

  const handleVerify = () => {
    setVerifyResult(null);
    verifyMutation.mutate(
      { path: { tenantId, id: domain.id } },
      {
        onSuccess: (result) => {
          setVerifyResult(result);
          if (result.success) {
            toaster(t('common:success.domain_verified'), 'success');
          }
        },
      },
    );
  };

  return (
    <Card className="w-full group/tile py-0 sm:py-0 transition-all">
      <CardContent className="flex flex-col p-2! sm:p-3! gap-2">
        <div className="flex items-center gap-2 sm:gap-3">
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

          <div className="flex items-center gap-1 ml-auto shrink-0">
            {!domain.verified && (
              <Button
                variant="plain"
                size="sm"
                className="text-sm"
                disabled={verifyMutation.isPending}
                onClick={handleVerify}
              >
                {verifyMutation.isPending ? (
                  <Loader2Icon size={16} className="animate-spin" />
                ) : (
                  <SearchCheckIcon size={16} />
                )}
                <span className="ml-1 max-sm:hidden">{t('common:verify')}</span>
              </Button>
            )}
            <Button
              variant="plain"
              size="sm"
              className="text-sm"
              disabled={deleteMutation.isPending}
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
              {deleteMutation.isPending ? <Loader2Icon size={16} className="animate-spin" /> : <Trash2Icon size={16} />}
              <span className="ml-1 max-sm:hidden">{t('common:remove')}</span>
            </Button>
          </div>
        </div>

        {/* DNS instructions for unverified domains */}
        {!domain.verified && (
          <Collapsible>
            <CollapsibleTrigger
              render={
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                />
              }
            >
              <ChevronDownIcon size={14} className="transition-transform in-data-panel-open:rotate-180" />
              {t('common:dns_instructions')}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 rounded-md bg-muted/50 p-3 text-xs space-y-2">
                <p className="text-muted-foreground">{t('common:dns_instructions.text')}</p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground font-medium min-w-14">{t('common:type')}</span>
                    <code className="bg-background px-1.5 py-0.5 rounded">TXT</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground font-medium min-w-14">{t('common:host')}</span>
                    <code className="bg-background px-1.5 py-0.5 rounded truncate flex-1">{txtHost}</code>
                    <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={() => copyHost(txtHost)}>
                      {hostCopied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground font-medium min-w-14">{t('common:value')}</span>
                    <code className="bg-background px-1.5 py-0.5 rounded truncate flex-1">{txtValue}</code>
                    <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={() => copyValue(txtValue)}>
                      {valueCopied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
                    </Button>
                  </div>
                </div>
                <p className="text-muted-foreground italic">{t('common:dns_propagation_hint')}</p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Verification result feedback */}
        {verifyResult && !verifyResult.success && (
          <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            <p>{t('common:dns_not_found')}</p>
            {verifyResult.diagnostics && verifyResult.diagnostics.recordsFound.length > 0 && (
              <p className="mt-1 text-muted-foreground">
                {t('common:dns_records_found')}: {verifyResult.diagnostics.recordsFound.join(', ')}
              </p>
            )}
          </div>
        )}
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
