import { Suspense } from 'react';
import { appConfig, isChannel } from 'shared';
import { getTools, type Slot, type SlotContexts } from '~/lib/placements';
import type { EnrichedChannel } from '~/modules/entities/types';
import { lazyNamed } from '~/utils/lazy-named';

const LtiTabHost = lazyNamed(() => import('~/modules/lti-platform/lti-tab-host'), 'LtiTabHost');

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

/**
 * Renders the registry tool a `$tool` route param names, lazy-loaded behind Suspense; its tab bar comes from {@link resolveNavTabs}.
 * On a channel's tabs an id no tool has may name the tab of an LTI tool placed there.
 */
export function SlotTabHost<S extends Slot>({ slot, toolId, context }: SlotTabHostProps<S>) {
  const tool = getTools(slot).find((candidate) => candidate.id === toolId);
  if (tool) return <Suspense fallback={null}>{tool.render(context)}</Suspense>;
  if (!appConfig.has.ltiPlatform || !isChannelContext(context)) return null;
  return (
    <Suspense fallback={null}>
      <LtiTabHost channel={context} tabId={toolId} />
    </Suspense>
  );
}
