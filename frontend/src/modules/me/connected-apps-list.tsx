import { onlineManager, useSuspenseQuery } from '@tanstack/react-query';
import { PlugZapIcon, UnplugIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ScopeBadges } from '~/modules/common/scope-badges';
import { toaster } from '~/modules/common/toaster/toaster';
import { meConnectedAppsQueryOptions, useRevokeConnectedAppMutation } from '~/modules/me/query';
import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';
import { dateShort } from '~/utils/date-short';

/** The OAuth consents of the current user (MCP clients, registered apps); revoking one deletes its tokens. */
export function ConnectedAppsList() {
  const { t } = useTranslation();
  const {
    data: { items },
  } = useSuspenseQuery(meConnectedAppsQueryOptions());
  const { mutate: revoke, isPending } = useRevokeConnectedAppMutation();

  const handleRevoke = (id: string) => {
    if (!onlineManager.isOnline()) return toaster.warning(t('c:action.offline.text'));
    revoke({ path: { id } });
  };

  if (!items.length)
    return (
      <p className="text-muted-foreground text-sm">
        {t('c:no_resource_yet', { resource: t('c:connected_apps').toLowerCase() })}
      </p>
    );

  return (
    <div className="flex flex-col gap-2">
      {items.map((app) => (
        <Card key={app.id} className="w-full py-0 sm:py-0">
          <CardContent className="flex items-center gap-3 p-3!">
            <PlugZapIcon className="icon-lg shrink-0 opacity-70" />
            <div className="flex min-w-0 grow flex-col gap-1">
              <span className="truncate font-medium">{app.clientName}</span>
              <div className="flex flex-wrap items-center gap-2">
                <ScopeBadges scopes={app.scopes} />
                <span className="text-muted-foreground text-xs">
                  {t('c:connected_on', { date: dateShort(app.createdAt) })}
                </span>
              </div>
            </div>
            <Button
              variant="plain"
              size="sm"
              className="ml-auto"
              loading={isPending}
              onClick={() => handleRevoke(app.id)}
            >
              <UnplugIcon />
              <span className="ml-1 max-md:hidden">{t('c:revoke')}</span>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
