import { Suspense } from 'react';
import { getTools, type Slot, type SlotContexts } from '~/lib/placements';

interface SlotTabHostProps<S extends Slot> {
  slot: S;
  /** The `$tool` route param. */
  toolId: string;
  context: SlotContexts[S];
}

/** Renders the registry tool a `$tool` route param names, lazy-loaded behind Suspense; its tab bar comes from {@link resolveNavTabs}. */
export function SlotTabHost<S extends Slot>({ slot, toolId, context }: SlotTabHostProps<S>) {
  const tool = getTools(slot).find((candidate) => candidate.id === toolId);
  if (!tool) return null;
  return <Suspense fallback={null}>{tool.render(context)}</Suspense>;
}
