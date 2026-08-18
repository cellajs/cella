import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { getTools, type Slot, type SlotContexts } from '~/lib/placements';

interface SlotTabHostProps<S extends Slot> {
  /** The tabs slot whose active registry tool this surface renders. */
  slot: S;
  /** The `$tool` route param naming which registry tool to render. */
  toolId: string;
  /** Render context passed to the tool (the channel entity, or undefined for non-entity surfaces). */
  context: SlotContexts[S];
  /** Rendered when no registry tool matches `toolId` (e.g. a stale or hand-typed tab url). */
  fallback?: ReactNode;
}

/**
 * Renders the registry tab tool named by a `$tool` host route's param, with the surface's context.
 * The tool's content lazy-loads behind Suspense; an unmatched id renders `fallback`. The matching
 * tab bar comes from {@link resolveNavTabs}.
 */
export function SlotTabHost<S extends Slot>({ slot, toolId, context, fallback = null }: SlotTabHostProps<S>) {
  const tool = getTools(slot).find((candidate) => candidate.id === toolId);
  if (!tool) return <>{fallback}</>;
  return <Suspense fallback={null}>{tool.render(context)}</Suspense>;
}
