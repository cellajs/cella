import { BotIcon, KeyRoundIcon, UnplugIcon } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActorRef, ApiKey, ServiceAccount } from 'sdk';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { ExpandableTile, ExpandableTileDetail, type TileTone } from '~/modules/common/expandable-tile';
import { NamedText } from '~/modules/common/named-text';
import { openConfirm } from '~/modules/common/open-confirm';
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

  const status = keyStatus(apiKey, account, !!secret);
  const isLive = !isEndedKey(apiKey);
  const maskedKey = (
    <span className="font-mono text-xs">
      {apiKey.prefix}…{apiKey.last4}
    </span>
  );

  // An ended key shows when it ended, the account's newest key its last use, any other key itself
  const meta = !isLive ? dateShort(keyEndedAt(apiKey)) : showActivity && status !== 'new' ? <LastUsed date={account.lastSeenAt} note /> : maskedKey;

  // A revoked key cannot be restored and whatever uses it stops working, so the click asks first
  const openRevokeConfirm = (event: MouseEvent<HTMLButtonElement>) =>
    openConfirm(event.currentTarget, {
      id: `revoke-api-key-${apiKey.id}`,
      title: <NamedText i18nKey="c:confirm.revoke_api_key" name={apiKey.name} />,
      label: 'c:revoke',
      icon: UnplugIcon,
      onConfirm: () => revoke({ path: { ...path, id: account.id, keyId: apiKey.id } }),
    });

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
          <ExpandableTileDetail label={t('c:api_key')}>{maskedKey}</ExpandableTileDetail>
          {/* One-step create names the account after its key; an account named otherwise shows here */}
          {account.name !== apiKey.name && <ExpandableTileDetail label={t('c:service_account')}>{account.name}</ExpandableTileDetail>}
          <ExpandableTileDetail label={t('c:role')}>{t(`c:${account.role}`)}</ExpandableTileDetail>
          {!isLive && <ExpandableTileDetail label={t(`c:${status}`)}>{dateShort(keyEndedAt(apiKey))}</ExpandableTileDetail>}
          {isLive && apiKey.expiresAt && <ExpandableTileDetail label={t('c:expires_at')}>{dateShort(apiKey.expiresAt)}</ExpandableTileDetail>}
          {showActivity && (
            <ExpandableTileDetail label={t('c:last_used')}>
              <LastUsed date={account.lastSeenAt} />
            </ExpandableTileDetail>
          )}
          {apiKey.createdBy && (
            <ExpandableTileDetail label={t('c:created_by')}>
              <CreatedBy actor={apiKey.createdBy} />
            </ExpandableTileDetail>
          )}
          <ExpandableTileDetail label={t('c:created_at')}>{dateShort(apiKey.createdAt)}</ExpandableTileDetail>
          <ExpandableTileDetail label={t('c:access')} wide>
            {apiKey.scopes ? <ScopeBadges scopes={apiKey.scopes} /> : t('c:full_access')}
          </ExpandableTileDetail>
        </>
      }
      actions={
        isLive && (
          <Button variant="secondary" size="sm" className="max-sm:w-full" loading={isPending} onClick={openRevokeConfirm}>
            <UnplugIcon />
            {t('c:revoke')}
          </Button>
        )
      }
    />
  );
}

interface KeylessAccountTileProps {
  account: ServiceAccount;
}

/** A service account without a live key: it stays listed, so an account nothing uses does not dangle unseen. */
export function KeylessAccountTile({ account }: KeylessAccountTileProps) {
  const { t } = useTranslation();

  return (
    <ExpandableTile
      value={account.id}
      icon={<BotIcon />}
      title={account.name}
      status={account.status === 'active' ? undefined : { tone: 'muted', label: t('c:disabled') }}
      meta={t('c:no_resource_yet', { resource: t('c:api_key_other') })}
      details={
        <>
          <ExpandableTileDetail label={t('c:role')}>{t(`c:${account.role}`)}</ExpandableTileDetail>
          <ExpandableTileDetail label={t('c:last_used')}>
            <LastUsed date={account.lastSeenAt} />
          </ExpandableTileDetail>
          {account.createdBy && (
            <ExpandableTileDetail label={t('c:created_by')}>
              <CreatedBy actor={account.createdBy} />
            </ExpandableTileDetail>
          )}
          <ExpandableTileDetail label={t('c:created_at')}>{dateShort(account.createdAt)}</ExpandableTileDetail>
        </>
      }
    />
  );
}

/** Who created a key or an account: a user's avatar and name open their profile, a service account shows as its name. */
function CreatedBy({ actor }: { actor: ActorRef }) {
  const openUserSheet = useOpenUserSheet();

  if (actor.kind !== 'user') {
    return (
      <span className="inline-flex max-w-full items-center gap-1.5">
        <EntityAvatar className="size-5 shrink-0" id={actor.id} name={actor.name} icon={BotIcon} />
        <span className="truncate">{actor.name}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      className="focus-effect active:press inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-md text-sm hover:underline"
      onClick={() => openUserSheet(actor.id)}
    >
      <EntityAvatar type="user" className="size-5 shrink-0" id={actor.id} name={actor.name} url={actor.thumbnailUrl} />
      <span className="truncate">{actor.name}</span>
    </button>
  );
}

interface LastUsedProps {
  /** When the service account last authenticated a request; null means never. */
  date: string | null;
  /** As a note after the status word, "last used 2h ago"; without it the bare time, under a Last used label. */
  note?: boolean;
}

function LastUsed({ date, note }: LastUsedProps) {
  const { t } = useTranslation();
  if (!date) return note ? t('c:never_used').toLowerCase() : t('c:never_used');
  const time = <RelativeDate date={date} />;
  return note ? (
    <>
      {t('c:last_used').toLowerCase()} {time}
    </>
  ) : (
    time
  );
}
