import { onlineManager, useQuery } from '@tanstack/react-query';
import { CheckIcon, CopyIcon, KeyRoundIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Credential, ServiceAccount } from 'sdk';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { toaster } from '~/modules/common/toaster/toaster';
import { ToolCard } from '~/modules/common/tool-card';
import type { EnrichedOrganization } from '~/modules/organization/types';
import {
  credentialsQueryOptions,
  serviceAccountsQueryOptions,
  useCreateServiceAccountMutation,
  useRevokeCredentialMutation,
} from '~/modules/service-accounts/query';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';
import { dateShort } from '~/utils/date-short';

/**
 * The one-step key experience (substrate D21): "Create API key" makes an implicit service account named after the
 * key, bound to this organization as a member, and shows the secret once. Keys list flat, grouped under their account.
 */
export function ApiKeysCard({ organization }: { organization: EnrichedOrganization }) {
  const { t } = useTranslation();
  const path = { tenantId: organization.tenantId, organizationId: organization.id };
  const { data } = useQuery(serviceAccountsQueryOptions(path));
  const { mutate: create, isPending: creating } = useCreateServiceAccountMutation();
  const [name, setName] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const { copied, copyToClipboard } = useCopyToClipboard();

  const handleCreate = () => {
    if (!onlineManager.isOnline()) return toaster.warning(t('c:action.offline.text'));
    const keyName = name.trim();
    if (!keyName) return;
    create(
      { path, body: { name: keyName, role: 'member', key: { name: keyName } } },
      {
        onSuccess: (created) => {
          setSecret(created.credential?.secret ?? null);
          setName('');
        },
      },
    );
  };

  return (
    <ToolCard label="c:api_keys" id="api-keys" description={t('c:api_keys.text')}>
      <div className="flex flex-col gap-4">
        <div className="flex gap-2 max-sm:flex-col">
          <Input
            value={name}
            placeholder={t('c:name')}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <Button type="button" variant="plain" onClick={handleCreate} loading={creating} disabled={!name.trim()}>
            <PlusIcon className="mr-2 size-4" />
            {t('c:create_resource', { resource: t('c:api_key').toLowerCase() })}
          </Button>
        </div>

        {secret && (
          <div className="flex flex-col gap-2 rounded-md border border-primary/40 bg-primary/5 p-3">
            <p className="text-sm">{t('c:api_key.text')}</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 font-mono text-xs">
                {secret}
              </code>
              <Button type="button" size="xs" variant="outline" onClick={() => copyToClipboard(secret)}>
                {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                {copied ? t('c:copied') : t('c:copy')}
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {data?.items.map((account) => (
            <ServiceAccountKeys key={account.id} account={account} path={path} />
          ))}
        </div>
      </div>
    </ToolCard>
  );
}

function ServiceAccountKeys({
  account,
  path,
}: {
  account: ServiceAccount;
  path: { tenantId: string; organizationId: string };
}) {
  const { t } = useTranslation();
  const { data } = useQuery(credentialsQueryOptions(path, account.id));
  const { mutate: revoke, isPending } = useRevokeCredentialMutation();
  const live = (data?.items ?? []).filter((c) => !c.revokedAt);
  if (live.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <span>{t('c:service_account')}</span>
        <span className="font-medium text-foreground">{account.name}</span>
        <Badge size="xs" variant="outline">
          {account.grants[0]?.role ?? '-'}
        </Badge>
      </div>
      {live.map((credential) => (
        <CredentialRow
          key={credential.id}
          credential={credential}
          isPending={isPending}
          onRevoke={() => revoke({ path: { ...path, id: account.id, credentialId: credential.id } })}
        />
      ))}
    </div>
  );
}

function CredentialRow({
  credential,
  isPending,
  onRevoke,
}: {
  credential: Credential;
  isPending: boolean;
  onRevoke: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 rounded-md border p-2 text-sm">
      <KeyRoundIcon className="size-4 shrink-0" strokeWidth={1.5} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{credential.name}</span>
        <span className="truncate font-mono text-muted-foreground text-xs">
          {credential.prefix}…{credential.last4}
        </span>
      </div>
      <span className="text-muted-foreground text-xs max-sm:hidden" aria-describedby={t('c:created_at')}>
        {dateShort(credential.createdAt)}
      </span>
      <Button type="button" size="xs" variant="ghost" onClick={onRevoke} loading={isPending}>
        {t('c:revoke')}
      </Button>
    </div>
  );
}
