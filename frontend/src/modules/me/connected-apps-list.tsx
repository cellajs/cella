import { onlineManager, useSuspenseQuery } from '@tanstack/react-query';
import { PlugZapIcon, UnplugIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { ExpandableTile, ExpandableTileDetail } from '~/modules/common/expandable-tile';
import { ScopeBadges } from '~/modules/common/scope-badges';
import { toastOffline } from '~/modules/common/toaster/toaster';
import { meConnectedAppsQueryOptions, useRevokeConnectedAppMutation } from '~/modules/me/query';
import { Accordion } from '~/modules/ui/accordion';
import { Button } from '~/modules/ui/button';
import { dateShort } from '~/utils/date-short';

/** The OAuth consents of the current user: MCP clients and registered apps. */
export function ConnectedAppsList() {
  const { t } = useTranslation();
  const {
    data: { items },
  } = useSuspenseQuery(meConnectedAppsQueryOptions());
  const { mutate: revoke, isPending, variables } = useRevokeConnectedAppMutation();

  const handleRevoke = (id: string) => {
    if (!onlineManager.isOnline()) return toastOffline();
    revoke({ path: { id } });
  };

  if (!items.length)
    return (
      <ContentPlaceholder size="sm" icon={PlugZapIcon} title="c:no_resource_yet" titleOptions={{ resource: t('c:connected_apps').toLowerCase() }} />
    );

  return (
    <Accordion className="flex flex-col gap-2">
      {items.map((app) => (
        <ExpandableTile
          key={app.id}
          value={app.id}
          icon={<PlugZapIcon />}
          title={app.clientName}
          meta={t('c:connected_on', { date: dateShort(app.createdAt) })}
          details={
            <>
              {app.expiresAt && <ExpandableTileDetail label={t('c:expires_at')}>{dateShort(app.expiresAt)}</ExpandableTileDetail>}
              <ExpandableTileDetail label={t('c:access')} wide>
                <ScopeBadges scopes={app.scopes} />
              </ExpandableTileDetail>
            </>
          }
          actions={
            <Button
              variant="plain"
              size="sm"
              className="max-sm:w-full"
              loading={isPending && variables?.path.id === app.id}
              onClick={() => handleRevoke(app.id)}
            >
              <UnplugIcon />
              {t('c:revoke')}
            </Button>
          }
        />
      ))}
    </Accordion>
  );
}
