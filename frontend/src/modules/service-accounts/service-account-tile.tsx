import { onlineManager, useQuery } from '@tanstack/react-query';
import { KeyRoundIcon, UnplugIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ApiKey, ServiceAccount } from 'sdk';
import { toaster } from '~/modules/common/toaster/toaster';
import { apiKeysQueryOptions, useRevokeApiKeyMutation } from '~/modules/service-accounts/query';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';
import type { QueryOrgContext } from '~/query/types';
import { dateShort } from '~/utils/date-short';

interface ServiceAccountTileProps {
  account: ServiceAccount;
  path: QueryOrgContext;
}

/** One service account with its live keys; a disabled or keyless account stays visible so nothing dangles unseen. */
export function ServiceAccountTile({ account, path }: ServiceAccountTileProps) {
  const { t } = useTranslation();
  const { data } = useQuery(apiKeysQueryOptions(path, account.id));
  const { mutate: revoke, isPending } = useRevokeApiKeyMutation();
  const live = (data?.items ?? []).filter((apiKey) => !apiKey.revokedAt);
  const role = account.grants[0]?.role;

  const handleRevoke = (apiKey: ApiKey) => {
    if (!onlineManager.isOnline()) return toaster.warning(t('c:action.offline.text'));
    revoke({ path: { ...path, id: account.id, keyId: apiKey.id } });
  };

  return (
    <Card className="w-full py-0 sm:py-0">
      <CardContent className="flex flex-col gap-2 p-3!">
        <div className="flex items-center gap-2 text-sm">
          <span className="truncate font-medium">{account.name}</span>
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
        </div>
        {data && live.length === 0 && (
          <p className="text-muted-foreground text-xs">{t('c:no_resource_yet', { resource: t('c:api_key_other') })}</p>
        )}
        {live.map((apiKey) => (
          <div key={apiKey.id} className="flex items-center gap-3 text-sm">
            <KeyRoundIcon className="icon-sm shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{apiKey.name}</span>
              <span className="truncate font-mono text-muted-foreground text-xs">
                {apiKey.prefix}…{apiKey.last4}
              </span>
            </div>
            <span className="text-muted-foreground text-xs max-sm:hidden" aria-describedby={t('c:created_at')}>
              {dateShort(apiKey.createdAt)}
            </span>
            <Button
              variant="plain"
              size="sm"
              className="ml-auto"
              loading={isPending}
              onClick={() => handleRevoke(apiKey)}
            >
              <UnplugIcon />
              <span className="ml-1 max-md:hidden">{t('c:revoke')}</span>
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
