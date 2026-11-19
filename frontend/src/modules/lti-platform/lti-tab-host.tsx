import { type LinkComponentProps, useNavigate, useRouterState } from '@tanstack/react-router';
import { RefreshCwIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorNotice } from '~/modules/common/error-notice';
import { PageSpinner } from '~/modules/common/spinner';
import type { EnrichedChannel } from '~/modules/entities/types';
import { LtiLaunchFrame } from '~/modules/lti-platform/launch-frame';
import { useLtiTabs } from '~/modules/lti-platform/lti-tabs';
import { Button } from '~/modules/ui/button';

/**
 * The LTI tool's tab `tabId` names in a channel, in a launch frame; else why the channel's tabs could not be read. A tab
 * no longer there or switched off sends the person to the channel's layout, which opens its landing tab.
 */
export function LtiTabHost({ channel, tabId }: { channel: EnrichedChannel; tabId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const layoutPath = useRouterState({ select: (state) => state.matches.at(-2)?.fullPath });
  const { tabs, query } = useLtiTabs(channel);
  const tab = tabs.find(({ id }) => id === tabId);
  const gone = query.isSuccess && !tab;

  useEffect(() => {
    // Cast: a match's fullPath is a plain string; link paths are the loose LinkComponentProps
    if (gone && layoutPath) navigate({ to: layoutPath as LinkComponentProps['to'], params: true, replace: true });
  }, [gone, layoutPath]);

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
