import { isProduct, type TrackedEventType } from 'shared';
import type { ActorContext } from '#/core/context';
import { onBackendModuleRegister } from '#/lib/module';
import { productCache } from '#/middlewares/product-cache/app-product-cache';

/** The batched rows an event is about: `before`/`after` index-aligned for updates, `before` alone for deletes. */
export interface MutationPayload {
  before?: Record<string, unknown>[];
  after?: Record<string, unknown>[];
  /**
   * True for the Yjs relay's own materialization of a collaborative document; handlers that would double-process those
   * re-writes return early, and the yjs module records no outside write for it. Not the same as a server-built write (an
   * MCP tool), which is an edit like a client's.
   */
  materialized?: boolean;
}

export type MutationHandler = (ctx: ActorContext, payload: MutationPayload) => Promise<void>;

const handlers = new Map<TrackedEventType, MutationHandler[]>();

/** Direct registration, for cross-module handlers derived from other modules' declarations. */
function registerMutationHandler(event: TrackedEventType, handler: MutationHandler): void {
  const existing = handlers.get(event);
  if (existing) existing.push(handler);
  else handlers.set(event, [handler]);
}

// Index the `onMutation` handlers each backend module declares (see defineBackendModule).
onBackendModuleRegister((module) => {
  for (const entry of Object.entries(module.onMutation ?? {})) {
    const [event, handler] = entry as [TrackedEventType, MutationHandler];
    registerMutationHandler(event, handler);
  }
});

/**
 * Awaits handlers in registration order, rejecting on the first error. Pass a transactional ctx to join the write.
 * A product row that is updated or deleted loses its detail cache entry here, before its transaction commits.
 */
export async function dispatchMutation(ctx: ActorContext, event: TrackedEventType, payload: MutationPayload = {}): Promise<void> {
  const [subject, verb] = event.split('.');
  if (verb !== 'created' && isProduct(subject)) {
    const ids = (payload.before ?? []).flatMap((row) => (typeof row.id === 'string' ? [row.id] : []));
    productCache.holdForWrite(subject, ids);
  }
  for (const handler of handlers.get(event) ?? []) await handler(ctx, payload);
}
