import { onlineManager, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { CopyCheckIcon, CopyIcon, KeyRoundIcon, UnplugIcon } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ApiKey, ServiceAccount } from 'sdk';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { useRelativeDate } from '~/hooks/use-relative-date';
import { ConfirmText } from '~/modules/common/confirm-text';
import { DateTooltip } from '~/modules/common/date-tooltip';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { PopConfirm } from '~/modules/common/popconfirm';
import { toaster } from '~/modules/common/toaster/toaster';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { apiKeysQueryOptions, useRevokeApiKeyMutation } from '~/modules/service-accounts/query';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';
import type { QueryOrgContext } from '~/query/types';
import { dateShort } from '~/utils/date-short';

interface ServiceAccountTileProps {
  account: ServiceAccount;
  path: QueryOrgContext;
  /** Plaintext of the keys created in this visit, by key id. Such a key shows it where the others show their details. */
  secrets: Record<string, string>;
}

/** One service account with its live keys; a disabled or keyless account stays visible so nothing dangles unseen. */
export function ServiceAccountTile({ account, path, secrets }: ServiceAccountTileProps) {
  const { t } = useTranslation();
  const { data } = useQuery(apiKeysQueryOptions(path, account.id));
  const { mutate: revoke, isPending } = useRevokeApiKeyMutation();
  const live = (data?.items ?? []).filter((apiKey) => !apiKey.revokedAt);
  const role = account.bindings[0]?.role;

  const handleRevoke = (apiKey: ApiKey) => {
    if (!onlineManager.isOnline()) return toaster.warning(t('c:action.offline.text'));
    revoke({ path: { ...path, id: account.id, keyId: apiKey.id } });
  };

  // A revoked key cannot be restored and whatever uses it stops working, so the click asks first.
  const openRevokeConfirm = (apiKey: ApiKey, event: MouseEvent<HTMLButtonElement>) => {
    const { create, remove } = useDropdowner.getState();
    create(
      <PopConfirm title={<ConfirmText i18nKey="c:confirm.revoke_api_key" values={{ name: apiKey.name }} />}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="destructive"
            className="justify-center sm:w-auto"
            onClick={() => {
              remove();
              handleRevoke(apiKey);
            }}
          >
            {t('c:revoke')}
          </Button>
          <Button type="reset" variant="secondary" data-autofocus onClick={() => remove()}>
            {t('c:cancel')}
          </Button>
        </div>
      </PopConfirm>,
      { id: 'revoke-api-key', triggerId: `revoke-api-key-${apiKey.id}`, triggerRef: { current: event.currentTarget }, align: 'end' },
    );
  };

  const badges = (
    <>
      {role && (
        <Badge size="xs" variant="outline">
          {t(`c:${role}`)}
        </Badge>
      )}
      {account.status !== 'active' && (
        <Badge size="xs" variant="secondary">
          {t('c:disabled')}
        </Badge>
      )}
    </>
  );

  return (
    <Card className="w-full py-0 sm:py-0">
      <CardContent className="flex flex-col gap-3 p-2 sm:p-3">
        {live.length === 0 && (
          <TileRow name={account.name} badges={badges}>
            {data && (
              <p className="truncate text-muted-foreground text-xs sm:text-sm">{t('c:no_resource_yet', { resource: t('c:api_key_other') })}</p>
            )}
          </TileRow>
        )}
        {live.map((apiKey, index) => {
          const secret = secrets[apiKey.id];
          return (
            <div key={apiKey.id} className="flex flex-col gap-3">
              <TileRow
                name={apiKey.name}
                // One-step create names the account after its key; an account named otherwise shows next to the key.
                accountName={account.name === apiKey.name ? undefined : account.name}
                badges={badges}
                action={
                  <Button
                    variant="plain"
                    size="sm"
                    className="ml-auto text-sm"
                    loading={isPending}
                    onClick={(event) => openRevokeConfirm(apiKey, event)}
                  >
                    <UnplugIcon />
                    <span className="max-md:hidden">{t('c:revoke')}</span>
                  </Button>
                }
              >
                {!secret && (
                  <>
                    <span className="truncate font-mono text-muted-foreground text-xs">
                      {apiKey.prefix}…{apiKey.last4}
                    </span>
                    {/* The account's activity shows once, on its newest key. */}
                    <KeyDetails apiKey={apiKey} lastSeenAt={index === 0 ? account.lastSeenAt : undefined} />
                  </>
                )}
              </TileRow>
              {secret && <NewKeySecret secret={secret} />}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

interface TileRowProps {
  name: string;
  accountName?: string;
  badges: ReactNode;
  /** The button at the end of the row. */
  action?: ReactNode;
  children?: ReactNode;
}

/** A row in the session tile's shape and sizes: the icon, one name with its badges, details under it, an action at the end. */
function TileRow({ name, accountName, badges, action, children }: TileRowProps) {
  return (
    <div className="flex gap-2 sm:gap-3 lg:items-center">
      <KeyRoundIcon className="size-4 shrink-0 max-sm:mt-0.5 sm:size-8" strokeWidth={1.5} />
      <div className="flex w-full flex-col gap-1 overflow-hidden">
        <div className="flex gap-1 xs:gap-2 max-xs:flex-col">
          <span className="truncate text-sm">{name}</span>
          {accountName && <span className="truncate text-muted-foreground text-sm">{accountName}</span>}
          <div className="flex items-center gap-2 empty:hidden">{badges}</div>
        </div>
        {children}
      </div>
      {action}
    </div>
  );
}

/** The plaintext of a key created in this visit: the one moment it can be copied. */
function NewKeySecret({ secret }: { secret: string }) {
  const { t } = useTranslation();
  const { copied, copyToClipboard } = useCopyToClipboard();

  return (
    <div className="flex flex-col gap-2 border-t border-dashed pt-3">
      <div className="flex items-center gap-2 rounded-lg bg-background px-3 py-2 font-mono sm:text-lg">
        <div className="min-w-0 grow select-all break-all">{secret}</div>
        <Button
          variant="cell"
          size="icon"
          className="shrink-0"
          aria-label={t('c:copy')}
          data-tooltip="true"
          data-tooltip-content={copied ? t('c:copied') : t('c:copy')}
          onClick={() => copyToClipboard(secret)}
        >
          {copied ? <CopyCheckIcon /> : <CopyIcon />}
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">{t('c:api_key.text')}</p>
    </div>
  );
}

interface KeyDetailsProps {
  apiKey: ApiKey;
  /** When the key's service account last authenticated a request; undefined leaves it out, null means never. */
  lastSeenAt?: string | null;
}

/** Who created a key and when, and when its service account was last used. */
function KeyDetails({ apiKey, lastSeenAt }: KeyDetailsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { createdBy } = apiKey;

  // The profile sheet opens from the search param, as it does from a members table row.
  const openProfile = (userId: string) => {
    if (!onlineManager.isOnline()) return toaster.warning(t('c:action.offline.text'));
    navigate({ to: '.', replace: false, resetScroll: false, search: (prev) => ({ ...prev, userSheetId: userId }) });
  };

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs sm:text-sm md:gap-x-5">
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="sr-only">{t('c:created_by')}: </span>
        {createdBy && (
          <TooltipButton toolTipContent={createdBy.name} side="top">
            <Button
              variant="none"
              size="auto"
              className="rounded-full p-0 transition-opacity hover:opacity-80"
              aria-label={createdBy.name}
              onClick={() => openProfile(createdBy.id)}
            >
              <EntityAvatar type="user" className="size-5 sm:size-6" id={createdBy.id} name={createdBy.name} url={createdBy.thumbnailUrl} />
            </Button>
          </TooltipButton>
        )}
        <DateTooltip date={apiKey.createdAt}>
          <span className="sr-only">{t('c:created_at')}: </span>
          {dateShort(apiKey.createdAt)}
        </DateTooltip>
      </span>
      {lastSeenAt === null && <span>{t('c:never_used')}</span>}
      {lastSeenAt && <LastUsed date={lastSeenAt} />}
    </div>
  );
}

function LastUsed({ date }: { date: string }) {
  const { t } = useTranslation();
  const relativeDate = useRelativeDate(date, t('c:ago'));

  return (
    <DateTooltip date={date}>
      {t('c:last_used')} {relativeDate}
    </DateTooltip>
  );
}
