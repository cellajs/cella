import { ArchiveIcon, ArchiveRestoreIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AlertBanner } from '~/modules/common/alerter/alert-banner';
import { NamedText } from '~/modules/common/named-text';
import { useArchiveChannelMutation } from '~/modules/entities/query';
import type { EnrichedChannel } from '~/modules/entities/types';
import { useCan } from '~/modules/entities/use-can';
import { Button } from '~/modules/ui/button';

/** Band an app places under the page header of an archived channel; a viewer who may update the channel unarchives it here, without the channels inside it. */
export function ArchivedBanner({ channel }: { channel: EnrichedChannel }) {
  const { t } = useTranslation();
  const can = useCan({ ignoreArchive: true });
  const { mutate, isPending } = useArchiveChannelMutation();

  const unarchive = () => mutate({ channel, archived: false, includeDescendants: false });

  return (
    <AlertBanner
      id={`archived-${channel.id}`}
      variant="warning"
      icon={ArchiveIcon}
      className="rounded-none border-x-0 border-t-0"
      action={
        can('update', channel.entityType, channel) && (
          <Button variant="warning" soft size="sm" className="max-sm:w-full" loading={isPending} onClick={unarchive}>
            <ArchiveRestoreIcon />
            {t('c:unarchive')}
          </Button>
        )
      }
    >
      <NamedText i18nKey="c:archived_notice.text" name={channel.name} />
    </AlertBanner>
  );
}
