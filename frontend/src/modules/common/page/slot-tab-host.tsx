import { RefreshCwIcon } from 'lucide-react';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { isChannel } from 'shared';
import { getTools, type Slot, type SlotContexts } from '~/lib/placements';
import { ErrorNotice } from '~/modules/common/error-notice';
import { PageSpinner } from '~/modules/common/spinner';
import type { EnrichedChannel } from '~/modules/entities/types';
import { useChannelDataTabs } from '~/modules/entities/use-channel-tab-options';
import { Button } from '~/modules/ui/button';

interface SlotTabHostProps<S extends Slot> {
  slot: S;
  /** The `$tool` route param. */
  toolId: string;
  context: SlotContexts[S];
}

const isChannelContext = (context: unknown): context is EnrichedChannel =>
  typeof context === 'object' &&
  context !== null &&
  'entityType' in context &&
  typeof context.entityType === 'string' &&
  isChannel(context.entityType);

/** The channel's data tab `tabId` names, rendered by its source; else a failed source's error, or nothing for an id no source lists. */
function DataTabHost({ channel, tabId }: { channel: EnrichedChannel; tabId: string }) {
  const { t } = useTranslation();
  const { tabs, isPending, failed } = useChannelDataTabs(channel);
  const match = tabs.find(({ tab }) => tab.id === tabId);
  if (match) return <Suspense fallback={null}>{match.source.render(channel, match.tab)}</Suspense>;
  if (failed) {
    return (
      <ErrorNotice boundary="app" error={failed.error}>
        <Button onClick={() => failed.refetch()} loading={failed.isFetching}>
          <RefreshCwIcon />
          {t('c:try_again')}
        </Button>
      </ErrorNotice>
    );
  }
  return isPending ? <PageSpinner /> : null;
}

/**
 * Renders the registry tool a `$tool` route param names, lazy-loaded behind Suspense; its tab bar comes from {@link resolveNavTabs}.
 * On a channel's tabs an id no tool has may name one of the tabs data adds to it.
 */
export function SlotTabHost<S extends Slot>({ slot, toolId, context }: SlotTabHostProps<S>) {
  const tool = getTools(slot).find((candidate) => candidate.id === toolId);
  if (tool) return <Suspense fallback={null}>{tool.render(context)}</Suspense>;
  return isChannelContext(context) ? <DataTabHost channel={context} tabId={toolId} /> : null;
}
