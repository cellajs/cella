import {
  BadgeCheckIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  GlobeIcon,
  Loader2Icon,
  SearchCheckIcon,
  Trash2Icon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GetDomainResponse, VerifyDomainResponse } from 'sdk';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { toaster } from '~/modules/common/toaster/toaster';
import { useDomainDeleteMutation, useDomainVerifyMutation } from '~/modules/tenants/query';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/modules/ui/collapsible';
import { dateShort } from '~/utils/date-short';

interface DomainTileProps {
  domain: GetDomainResponse;
  tenantId: string;
}

export function DomainTile({ domain, tenantId }: DomainTileProps) {
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
            toaster(t('c:success.domain_verified'), 'success');
          }
        },
      },
    );
  };

  return (
    <Card className="group/tile w-full py-0 transition-all sm:py-0">
      <CardContent className="flex flex-col gap-2 p-2! sm:p-3!">
        <div className="flex items-center gap-2 sm:gap-3">
          <GlobeIcon className="size-4 shrink-0 opacity-50 sm:h-6 sm:w-6" strokeWidth={1.5} />

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-sm">{domain.domain}</span>
              <Badge size="xs" variant={domain.verified ? 'success' : 'secondary'}>
                {domain.verified && <BadgeCheckIcon size={12} className="shrink-0" />}
                {domain.verified ? t('c:verified') : t('c:unverified')}
              </Badge>
            </div>
            <p className="text-muted-foreground text-xs">{dateShort(domain.createdAt)}</p>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1">
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
                <span className="ml-1 max-sm:hidden">{t('c:verify')}</span>
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
                      toaster(t('c:success.delete_resource', { resource: t('c:domain') }), 'success');
                    },
                  },
                );
              }}
            >
              {deleteMutation.isPending ? <Loader2Icon size={16} className="animate-spin" /> : <Trash2Icon size={16} />}
              <span className="ml-1 max-sm:hidden">{t('c:remove')}</span>
            </Button>
          </div>
        </div>

        {/* DNS instructions for unverified domains */}
        {!domain.verified && (
          <Collapsible>
            <CollapsibleTrigger
              render={
                <span className="flex cursor-pointer items-center gap-1 text-muted-foreground text-xs hover:text-foreground" />
              }
            >
              <ChevronDownIcon size={14} className="in-data-panel-open:rotate-180 transition-transform" />
              {t('c:dns_instructions')}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 space-y-2 rounded-md bg-muted/50 p-3 text-xs">
                <p className="text-muted-foreground">{t('c:dns_instructions.text')}</p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="min-w-14 font-medium text-muted-foreground">{t('c:type')}</span>
                    <code className="rounded bg-background px-1.5 py-0.5">TXT</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="min-w-14 font-medium text-muted-foreground">{t('c:host')}</span>
                    <code className="flex-1 truncate rounded bg-background px-1.5 py-0.5">{txtHost}</code>
                    <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={() => copyHost(txtHost)}>
                      {hostCopied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="min-w-14 font-medium text-muted-foreground">{t('c:value')}</span>
                    <code className="flex-1 truncate rounded bg-background px-1.5 py-0.5">{txtValue}</code>
                    <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={() => copyValue(txtValue)}>
                      {valueCopied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
                    </Button>
                  </div>
                </div>
                <p className="text-muted-foreground italic">{t('c:dns_propagation_hint')}</p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Verification result feedback */}
        {verifyResult && !verifyResult.success && (
          <div className="rounded-md bg-destructive/10 p-2 text-destructive text-xs">
            <p>{t('c:dns_not_found')}</p>
            {verifyResult.diagnostics && verifyResult.diagnostics.recordsFound.length > 0 && (
              <p className="mt-1 text-muted-foreground">
                {t('c:dns_records_found')}: {verifyResult.diagnostics.recordsFound.join(', ')}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
