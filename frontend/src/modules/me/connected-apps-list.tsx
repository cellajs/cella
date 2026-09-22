import { onlineManager, useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { PlugZapIcon, UnplugIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GetConnectedAppsResponse } from 'sdk';
import { revokeConnectedApp } from 'sdk';
import { toaster } from '~/modules/common/toaster/toaster';
import { meConnectedAppsQueryOptions } from '~/modules/me/query';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';
import { queryClient } from '~/query/query-client';
import { dateShort } from '~/utils/date-short';

/** The OAuth consents of the current user (MCP clients, registered apps); revoking one deletes its tokens. */
export function ConnectedAppsList() {
  const { t } = useTranslation();

  const queryOptions = meConnectedAppsQueryOptions();
  const {
    data: { items },
  } = useSuspenseQuery(queryOptions);

  const { mutate: revoke, isPending } = useMutation({
    mutationFn: async (id: string) => {
      await revokeConnectedApp({ path: { id } });
      return id;
    },
    onSuccess: (id) => {
      queryClient.setQueryData<GetConnectedAppsResponse>(queryOptions.queryKey, (oldData) => {
        if (!oldData) return oldData;
        return { ...oldData, items: oldData.items.filter((item) => item.id !== id) };
      });
      toaster.success(t('c:success.connected_app_revoked'));
    },
  });

  const handleRevoke = (id: string) => {
    if (!onlineManager.isOnline()) return toaster.warning(t('c:action.offline.text'));
    revoke(id);
  };

  if (!items.length) return <p className="text-muted-foreground text-sm">{t('c:no_connected_apps')}</p>;

  return (
    <div className="flex flex-col gap-2">
      {items.map((app) => (
        <Card key={app.id} className="w-full py-0 sm:py-0">
          <CardContent className="flex items-center gap-3 p-3!">
            <PlugZapIcon className="icon-lg shrink-0 opacity-70" />
            <div className="flex min-w-0 grow flex-col gap-1">
              <span className="truncate font-medium">{app.clientName}</span>
              <div className="flex flex-wrap items-center gap-1">
                {app.scopes.map((scope) => (
                  <Badge key={scope} variant="secondary" className="font-mono text-xs">
                    {scope}
                  </Badge>
                ))}
                <span className="text-muted-foreground text-xs">
                  {t('c:connected_on', { date: dateShort(app.createdAt) })}
                </span>
              </div>
            </div>
            <Button variant="destructive" size="sm" disabled={isPending} onClick={() => handleRevoke(app.id)}>
              <UnplugIcon className="icon-sm mr-2" />
              {t('c:revoke')}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
