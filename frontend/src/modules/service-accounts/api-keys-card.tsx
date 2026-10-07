import { onlineManager, useSuspenseQuery } from '@tanstack/react-query';
import { KeyRoundIcon, PlusIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ensureStepUp } from '~/modules/auth/step-up';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { ExpandableList } from '~/modules/common/expandable-list';
import { toaster } from '~/modules/common/toaster/toaster';
import { ToolCard } from '~/modules/common/tool-card';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { CreateApiKeyForm, type CreatedApiKey, createApiKeyDialogId } from '~/modules/service-accounts/create-api-key-form';
import { serviceAccountsQueryOptions } from '~/modules/service-accounts/query';
import { ServiceAccountTile } from '~/modules/service-accounts/service-account-tile';
import { Button } from '~/modules/ui/button';

/**
 * Service accounts list with their keys under them, and "Add API key" opens the create dialog. A key created in this
 * visit shows its plaintext in its tile until the card unmounts: a refresh or leaving the page drops it for good.
 */
export function ApiKeysCard({ organization }: { organization: EnrichedOrganization }) {
  const { t } = useTranslation();
  const path = { tenantId: organization.tenantId, organizationId: organization.id };
  const {
    data: { items: accounts },
  } = useSuspenseQuery(serviceAccountsQueryOptions(path));
  const addButtonRef = useRef<HTMLButtonElement | null>(null);
  // Plaintext by key id, in component state only: it never enters the query cache, which persists.
  const [secrets, setSecrets] = useState<Record<string, string>>({});

  const openCreateDialog = async () => {
    if (!onlineManager.isOnline()) return toaster.warning(t('c:action.offline.text'));

    // Minting a key needs a stepped-up session: the user proves it before the form opens, so the form submits once.
    const steppedUp = await ensureStepUp().then(
      () => true,
      () => false,
    );
    if (!steppedUp) return;

    const onCreated = ({ id, secret }: CreatedApiKey) => setSecrets((prev) => ({ ...prev, [id]: secret }));

    useDialoger.getState().create(<CreateApiKeyForm path={path} onCreated={onCreated} />, {
      id: createApiKeyDialogId,
      triggerRef: addButtonRef,
      className: 'md:max-w-xl',
      title: t('c:create_resource', { resource: t('c:api_key') }),
      description: t('c:create_api_key.text'),
    });
  };

  return (
    <ToolCard label="c:api_keys" description={t('c:api_keys.text')}>
      <div className="flex flex-row max-sm:flex-col">
        <Button ref={addButtonRef} type="button" variant="plain" onClick={openCreateDialog}>
          <PlusIcon className="size-4" />
          {t('c:add_resource', { resource: t('c:api_key') })}
        </Button>
      </div>

      {accounts.length === 0 ? (
        <ContentPlaceholder size="sm" icon={KeyRoundIcon} title="c:no_resource_yet" titleProps={{ resource: t('c:api_key_other') }} />
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          <ExpandableList
            items={accounts}
            renderItem={(account) => <ServiceAccountTile key={account.id} account={account} path={path} secrets={secrets} />}
            initialDisplayCount={3}
            expandText="c:more"
          />
        </div>
      )}
    </ToolCard>
  );
}
