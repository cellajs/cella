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
 * Renders the active registry tab tool for a `$tool` host route: looks up the slot's tool by the
 * route's `$tool` param and renders it with the surface's context. The tool's content lazy-loads
 * behind Suspense; an unmatched id renders `fallback`. This is the render half of a tabbed surface
 * (the tab bar comes from {@link resolveNavTabs}), so one host route serves every registry tab.
 */
export function SlotTabHost<S extends Slot>({ slot, toolId, context, fallback = null }: SlotTabHostProps<S>) {
  const tool = getTools(slot).find((candidate) => candidate.id === toolId);
  if (!tool) return <>{fallback}</>;
  return <Suspense fallback={null}>{tool.render(context)}</Suspense>;
}
