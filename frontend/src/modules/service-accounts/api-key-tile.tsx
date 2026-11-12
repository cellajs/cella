import { KeyRoundIcon, UnplugIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ApiKey, ServiceAccount } from 'sdk';
import { DateTooltip } from '~/modules/common/date-tooltip';
import { DeleteForm } from '~/modules/common/delete-form';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { ExpandableTile, ExpandableTileDetail, type TileTone } from '~/modules/common/expandable-tile';
import { NamedText } from '~/modules/common/named-text';
import { RelativeDate } from '~/modules/common/relative-date';
import { ScopeBadges } from '~/modules/common/scope-badges';
import { SecretBox } from '~/modules/common/secret-box';
import { useRevokeApiKeyMutation } from '~/modules/service-accounts/query';
import { Button } from '~/modules/ui/button';
import { useOpenUserSheet } from '~/modules/user/use-open-user-sheet';
import type { QueryOrgContext } from '~/query/types';
import { dateShort } from '~/utils/date-short';

/** A key that no longer authenticates: revoked, or past its expiry. */
export const isEndedKey = (apiKey: ApiKey) =>
  apiKey.revokedAt !== null || (apiKey.expiresAt !== null && new Date(apiKey.expiresAt).getTime() <= Date.now());

/** When the key stopped authenticating, or will: its revocation, else its expiry; null for a key without expiry. */
export const keyEndedAt = (apiKey: ApiKey) => apiKey.revokedAt ?? apiKey.expiresAt;

const statusTones = { new: 'success', active: 'info', disabled: 'muted', expired: 'warning', revoked: 'destructive' } as const satisfies Record<
  string,
  TileTone
>;

const keyStatus = (apiKey: ApiKey, account: ServiceAccount, isNew: boolean): keyof typeof statusTones => {
  if (apiKey.revokedAt) return 'revoked';
  if (isEndedKey(apiKey)) return 'expired';
  if (isNew) return 'new';
  return account.status === 'active' ? 'active' : 'disabled';
};

interface ApiKeyTileProps {
  apiKey: ApiKey;
  account: ServiceAccount;
  path: QueryOrgContext;
  /** The plaintext, for a key created in this visit. */
  secret?: string;
  /** Shows the account's last use, which the account records: on its newest live key only. */
  showActivity?: boolean;
}

/** One API key; a key created in this visit opens with its secret to copy. */
export function ApiKeyTile({ apiKey, account, path, secret, showActivity }: ApiKeyTileProps) {
  const { t } = useTranslation();
  const { mutate: revoke, isPending } = useRevokeApiKeyMutation();
  // A revoked key cannot be restored and whatever uses it stops working, so the panel asks first
  const [confirming, setConfirming] = useState(false);

  const status = keyStatus(apiKey, account, !!secret);
  const isLive = status === 'new' || status === 'active' || status === 'disabled';
  const maskedKey = `${apiKey.prefix}…${apiKey.last4}`;

  // An ended key shows when it ended, the account's newest key its last use, any other key itself
  let meta: ReactNode = <span className="font-mono text-xs">{maskedKey}</span>;
  if (!isLive) meta = dateShort(keyEndedAt(apiKey));
  else if (showActivity && status !== 'new') {
    meta = account.lastSeenAt ? (
      <>
        {t('c:last_used').toLowerCase()} <RelativeDate date={account.lastSeenAt} />
      </>
    ) : (
      t('c:never_used').toLowerCase()
    );
  }

  return (
    <ExpandableTile
      value={apiKey.id}
      icon={<KeyRoundIcon />}
      title={apiKey.name}
      status={{ tone: statusTones[status], label: t(`c:${status}`) }}
      meta={meta}
      lead={
        secret && (
          <div className="flex flex-col gap-2">
            <SecretBox value={secret} />
            <p className="text-muted-foreground text-sm">{t('c:api_key.text')}</p>
          </div>
        )
      }
      details={
        <>
          <ExpandableTileDetail label={t('c:api_key')}>
            <span className="font-mono text-xs">{maskedKey}</span>
          </ExpandableTileDetail>
          {/* One-step create names the account after its key; an account named otherwise shows here */}
          {account.name !== apiKey.name && <ExpandableTileDetail label={t('c:service_account')}>{account.name}</ExpandableTileDetail>}
          <ExpandableTileDetail label={t('c:role')}>{t(`c:${account.role}`)}</ExpandableTileDetail>
          <ExpandableTileDetail label={t('c:access')}>
            {apiKey.scopes ? <ScopeBadges scopes={apiKey.scopes} /> : t('c:full_access')}
          </ExpandableTileDetail>
          {!isLive && <ExpandableTileDetail label={t(`c:${status}`)}>{dateShort(keyEndedAt(apiKey))}</ExpandableTileDetail>}
          {isLive && apiKey.expiresAt && <ExpandableTileDetail label={t('c:expires_at')}>{dateShort(apiKey.expiresAt)}</ExpandableTileDetail>}
          {apiKey.createdBy && (
            <ExpandableTileDetail label={t('c:created_by')}>
              <CreatedBy actor={apiKey.createdBy} />
            </ExpandableTileDetail>
          )}
          <ExpandableTileDetail label={t('c:created_at')}>
            <DateTooltip date={apiKey.createdAt}>
              <span>{dateShort(apiKey.createdAt)}</span>
            </DateTooltip>
          </ExpandableTileDetail>
        </>
      }
      actions={
        isLive &&
        (confirming ? (
          <div className="intent-destructive soft-bg soft-border flex w-full flex-col gap-3 rounded-md border p-3">
            <p className="text-sm">
              <NamedText i18nKey="c:confirm.revoke_api_key" name={apiKey.name} />
            </p>
            <DeleteForm
              label="c:revoke"
              icon={UnplugIcon}
              pending={isPending}
              onDelete={() => revoke({ path: { ...path, serviceAccountId: account.id, apiKeyId: apiKey.id } })}
              onCancel={() => setConfirming(false)}
            />
          </div>
        ) : (
          <Button variant="secondary" size="sm" className="max-sm:w-full" onClick={() => setConfirming(true)}>
            <UnplugIcon />
            {t('c:revoke')}
          </Button>
        ))
      }
    />
  );
}

/** A service account without a live key: it stays listed, so an account nothing uses does not dangle unseen. */
export function KeylessAccountTile({ account }: { account: ServiceAccount }) {
  const { t } = useTranslation();

  return (
    <ExpandableTile
      value={account.id}
      icon={<KeyRoundIcon />}
      title={account.name}
      status={account.status === 'active' ? undefined : { tone: 'muted', label: t('c:disabled') }}
      meta={t('c:no_resource_yet', { resource: t('c:api_key_other') })}
      details={
        <>
          <ExpandableTileDetail label={t('c:role')}>{t(`c:${account.role}`)}</ExpandableTileDetail>
          <ExpandableTileDetail label={t('c:last_used')}>
            {account.lastSeenAt ? <RelativeDate date={account.lastSeenAt} /> : t('c:never_used')}
          </ExpandableTileDetail>
          {account.createdBy && (
            <ExpandableTileDetail label={t('c:created_by')}>
              <CreatedBy actor={account.createdBy} />
            </ExpandableTileDetail>
          )}
          <ExpandableTileDetail label={t('c:created_at')}>
            <DateTooltip date={account.createdAt}>
              <span>{dateShort(account.createdAt)}</span>
            </DateTooltip>
          </ExpandableTileDetail>
        </>
      }
    />
  );
}

/** Who created a key or an account, as their avatar and name, which open their profile. */
function CreatedBy({ actor }: { actor: NonNullable<ApiKey['createdBy']> }) {
  const openProfile = useOpenUserSheet();

  return (
    <button
      type="button"
      className="focus-effect active:press link-reveal inline-flex max-w-full items-center gap-1.5 rounded-md text-sm whitespace-nowrap"
      onClick={() => openProfile(actor.id)}
    >
      <EntityAvatar type="user" className="size-5 shrink-0" id={actor.id} name={actor.name} url={actor.thumbnailUrl} />
      <span className="truncate">{actor.name}</span>
    </button>
  );
}
