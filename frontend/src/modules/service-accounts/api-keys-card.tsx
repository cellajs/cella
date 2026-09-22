import { onlineManager, useSuspenseQuery } from '@tanstack/react-query';
import { CopyCheckIcon, CopyIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { ExpandableList } from '~/modules/common/expandable-list';
import { toaster } from '~/modules/common/toaster/toaster';
import { ToolCard } from '~/modules/common/tool-card';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { serviceAccountsQueryOptions, useCreateServiceAccountMutation } from '~/modules/service-accounts/query';
import { ServiceAccountTile } from '~/modules/service-accounts/service-account-tile';
import { Button } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';

/**
 * The one-step key experience (substrate D21): "Create API key" makes an implicit service account named after the
 * key, bound to this organization as a member, and shows the secret once. Accounts list with their keys under them.
 */
export function ApiKeysCard({ organization }: { organization: EnrichedOrganization }) {
  const { t } = useTranslation();
  const path = { tenantId: organization.tenantId, organizationId: organization.id };
  const {
    data: { items: accounts },
  } = useSuspenseQuery(serviceAccountsQueryOptions(path));
  const { mutate: create, isPending: creating } = useCreateServiceAccountMutation();
  const [name, setName] = useState('');
  const [secret, setSecret] = useState<string | null>(null);

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
            {t('c:create_resource', { resource: t('c:api_key') })}
          </Button>
        </div>

        {secret && <SecretOnce secret={secret} onDismiss={() => setSecret(null)} />}

        {accounts.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('c:no_resource_yet', { resource: t('c:api_key_other') })}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <ExpandableList
              items={accounts}
              renderItem={(account) => <ServiceAccountTile key={account.id} account={account} path={path} />}
              initialDisplayCount={3}
              expandText="c:more"
            />
          </div>
        )}
      </div>
    </ToolCard>
  );
}

/** The plaintext, shown once: copy, then dismiss, which drops it from state and the DOM. */
function SecretOnce({ secret, onDismiss }: { secret: string; onDismiss: () => void }) {
  const { t } = useTranslation();
  const { copied, copyToClipboard } = useCopyToClipboard();

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-card p-3 text-card-foreground">
      <p className="text-sm">{t('c:api_key.text')}</p>
      <div className="flex gap-2 truncate rounded-lg bg-background px-3 py-2 font-mono">
        <div className="w-full grow truncate">{secret}</div>
        <Button
          variant="cell"
          size="icon"
          className="h-full"
          aria-label="Copy"
          data-tooltip="true"
          data-tooltip-content={copied ? t('c:copied') : t('c:copy')}
          onClick={() => copyToClipboard(secret)}
        >
          {copied ? <CopyCheckIcon /> : <CopyIcon />}
        </Button>
      </div>
      <Button type="button" variant="outline" size="sm" className="self-end" onClick={onDismiss}>
        {t('c:stored_it')}
      </Button>
    </div>
  );
}
