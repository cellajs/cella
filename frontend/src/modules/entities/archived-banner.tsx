import { ArchiveIcon, ArchiveRestoreIcon } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { useArchiveChannelMutation } from '~/modules/entities/query';
import type { EnrichedChannel } from '~/modules/entities/types';
import { useCan } from '~/modules/entities/use-can';
import { Alert, AlertDescription } from '~/modules/ui/alert';
import { Button } from '~/modules/ui/button';

/** Band an app places under the page header of an archived channel, the flat sibling of the hatched draft band; a viewer who may update the channel unarchives it here, without the channels inside it. */
export function ArchivedBanner({ channel }: { channel: EnrichedChannel }) {
  const { t } = useTranslation();
  const can = useCan({ ignoreArchive: true });
  const { mutate, isPending } = useArchiveChannelMutation();

  const unarchive = () => mutate({ channel, archived: false, includeDescendants: false });

  return (
    <Alert
      variant="plain"
      className="border-border rounded-none border-0 border-b bg-[color-mix(in_oklab,var(--foreground)_4%,var(--background))] px-3 py-2"
    >
      <AlertDescription className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="max-w-measure text-muted-foreground flex gap-2">
          <ArchiveIcon className="text-foreground-soft mt-0.5 size-4 shrink-0" />
          <span>
            <Trans
              t={t}
              i18nKey="c:archived_banner.text"
              values={{ resource: t(`c:${channel.entityType}`) }}
              components={{ strong: <strong className="text-foreground font-semibold" /> }}
            />
          </span>
        </span>
        {can('update', channel.entityType, channel) && (
          <Button variant="outline" size="sm" className="shrink-0 max-sm:w-full" loading={isPending} onClick={unarchive}>
            <ArchiveRestoreIcon className="size-3.5" />
            {t('c:unarchive')}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
