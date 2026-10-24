import { onlineManager, useSuspenseQueries, useSuspenseQuery } from '@tanstack/react-query';
import { KeyRoundIcon, PlusIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ApiKey, ServiceAccount } from 'sdk';
import { ensureStepUp } from '~/modules/auth/step-up';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { ExpandableList } from '~/modules/common/expandable-list';
import { TileListHeading, useOpenTile } from '~/modules/common/expandable-tile';
import { toastOffline } from '~/modules/common/toaster/toaster';
import { ToolCard } from '~/modules/common/tool-card';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { ApiKeyTile, isEndedKey, KeylessAccountTile, keyEndedAt } from '~/modules/service-accounts/api-key-tile';
import { CreateApiKeyForm, type CreatedApiKey, createApiKeyDialogId } from '~/modules/service-accounts/create-api-key-form';
import { apiKeysQueryOptions, serviceAccountsQueryOptions } from '~/modules/service-accounts/query';
import { Button } from '~/modules/ui/button';

interface ApiKeysCardProps {
  organization: EnrichedOrganization;
}

/** A live key with its account, or an account without one. */
interface ActiveItem {
  account: ServiceAccount;
  apiKey?: ApiKey;
  /** The account's newest live key, which shows the account's last use. */
  showActivity?: boolean;
}

/** The organization's API keys, live ones first; Add API key opens the create dialog. */
export function ApiKeysCard({ organization }: ApiKeysCardProps) {
  const { t } = useTranslation();
  const path = { tenantId: organization.tenantId, organizationId: organization.id };
  const {
    data: { items: accounts },
  } = useSuspenseQuery(serviceAccountsQueryOptions(path));
  const keyLists = useSuspenseQueries({ queries: accounts.map((account) => apiKeysQueryOptions(path, account.id)) });
  const addButtonRef = useRef<HTMLButtonElement>(null);
  // Plaintext by key id, in component state only: it never enters the query cache, which persists.
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  // A key or account id: one tile open at a time, across both lists
  const { openId, setOpenId, toggle } = useOpenTile();

  // Keys arrive newest first, per account
  const active: ActiveItem[] = [];
  const ended: { account: ServiceAccount; apiKey: ApiKey }[] = [];
  accounts.forEach((account, index) => {
    const keys = keyLists[index].data.items;
    const liveKeys = keys.filter((apiKey) => !isEndedKey(apiKey));
    if (!liveKeys.length) active.push({ account });
    for (const [keyIndex, apiKey] of liveKeys.entries()) active.push({ account, apiKey, showActivity: keyIndex === 0 });
    for (const apiKey of keys.filter(isEndedKey)) ended.push({ account, apiKey });
  });
  const endedTime = (apiKey: ApiKey) => new Date(keyEndedAt(apiKey) ?? 0).getTime();
  ended.sort((a, b) => endedTime(b.apiKey) - endedTime(a.apiKey));

  const openCreateDialog = async () => {
    if (!onlineManager.isOnline()) return toastOffline();

    // Minting a key needs a stepped-up session: the user proves it before the form opens, so the form submits once.
    const steppedUp = await ensureStepUp().then(
      () => true,
      () => false,
    );
    if (!steppedUp) return;

    const onCreated = ({ id, secret }: CreatedApiKey) => {
      setSecrets((prev) => ({ ...prev, [id]: secret }));
      setOpenId(id);
    };

    dialoger.getState().create(<CreateApiKeyForm path={path} onCreated={onCreated} />, {
      id: createApiKeyDialogId,
      triggerRef: addButtonRef,
      className: 'md:max-w-xl',
      title: t('c:create_resource', { resource: t('c:api_key') }),
      description: t('c:create_api_key.text'),
    });
  };

  return (
    <ToolCard label="c:api_keys" description={t('c:api_keys.text')}>
      {accounts.length === 0 ? (
        <Button ref={addButtonRef} className="max-sm:w-full" variant="plain" onClick={openCreateDialog}>
          <KeyRoundIcon />
          {t('c:create_resource', { resource: t('c:api_key') })}
        </Button>
      ) : (
        <>
          <TileListHeading title={t('c:active')} count={active.length}>
            <Button ref={addButtonRef} className="-mr-2" variant="ghost" size="sm" onClick={openCreateDialog}>
              <PlusIcon />
              {t('c:add_resource', { resource: t('c:api_key') })}
            </Button>
          </TileListHeading>
          <div className="mt-2 flex flex-col gap-2">
            <ExpandableList
              items={active}
              renderItem={({ account, apiKey, showActivity }) =>
                apiKey ? (
                  <ApiKeyTile
                    key={apiKey.id}
                    apiKey={apiKey}
                    account={account}
                    path={path}
                    secret={secrets[apiKey.id]}
                    showActivity={showActivity}
                    expanded={openId === apiKey.id}
                    onToggle={() => toggle(apiKey.id)}
                  />
                ) : (
                  <KeylessAccountTile key={account.id} account={account} expanded={openId === account.id} onToggle={() => toggle(account.id)} />
                )
              }
              initialDisplayCount={3}
            />
          </div>
        </>
      )}

      {ended.length > 0 && (
        <>
          <TileListHeading className="mt-6 mb-3" title={t('c:ended')} count={ended.length} />
          <div className="flex flex-col gap-2">
            <ExpandableList
              items={ended}
              renderItem={({ account, apiKey }) => (
                <ApiKeyTile
                  key={apiKey.id}
                  apiKey={apiKey}
                  account={account}
                  path={path}
                  expanded={openId === apiKey.id}
                  onToggle={() => toggle(apiKey.id)}
                />
              )}
              initialDisplayCount={2}
            />
          </div>
        </>
      )}
    </ToolCard>
  );
}
