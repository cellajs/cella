import { RefreshCwIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ErrorNotice } from '~/modules/common/error-notice';
import { PageSpinner } from '~/modules/common/spinner';
import type { EnrichedChannel } from '~/modules/entities/types';
import { LtiLaunchFrame } from '~/modules/lti-platform/launch-frame';
import { useLtiTabs } from '~/modules/lti-platform/lti-tabs';
import { Button } from '~/modules/ui/button';

/** The LTI tool's tab `tabId` names in a channel, in a launch frame; else why the channel's tabs could not be read, or nothing for an id no tab has. */
export function LtiTabHost({ channel, tabId }: { channel: EnrichedChannel; tabId: string }) {
  const { t } = useTranslation();
  const { tabs, query } = useLtiTabs(channel);
  const tab = tabs.find(({ id }) => id === tabId);

  // Keyed: each resource link starts its own launch
  if (tab) return <LtiLaunchFrame key={tab.link.id} channel={channel} resourceLink={tab.link} />;
  if (query.isError) {
    return (
      <ErrorNotice boundary="app" error={query.error}>
        <Button onClick={() => query.refetch()} loading={query.isFetching}>
          <RefreshCwIcon />
          {t('c:try_again')}
        </Button>
      </ErrorNotice>
    );
  }
  return query.isPending ? <PageSpinner /> : null;
}
