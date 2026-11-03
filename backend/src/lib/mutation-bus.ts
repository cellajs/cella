import type { TrackedEventType } from 'shared';
import type { ActorContext } from '#/core/context';
import { onBackendModuleRegister } from '#/lib/module';

/** The batched rows an event is about: `before`/`after` index-aligned for updates, `before` alone for deletes. */
export interface MutationPayload {
  before?: Record<string, unknown>[];
  after?: Record<string, unknown>[];
}

/** A module's reaction to one event, awaited inside the request that dispatched it. */
export type MutationHandler = (ctx: ActorContext, payload: MutationPayload) => Promise<void>;

const handlers = new Map<TrackedEventType, MutationHandler[]>();

// Index the `onMutation` handlers each backend module declares (see defineBackendModule).
onBackendModuleRegister((module) => {
  for (const entry of Object.entries(module.onMutation ?? {})) {
    const [event, handler] = entry as [TrackedEventType, MutationHandler];
    const existing = handlers.get(event);
    if (existing) existing.push(handler);
    else handlers.set(event, [handler]);
  }
});

/** Awaits handlers in registration order, rejecting on the first error. Pass a transactional ctx to join the write. */
export async function dispatchMutation(ctx: ActorContext, event: TrackedEventType, payload: MutationPayload = {}): Promise<void> {
  for (const handler of handlers.get(event) ?? []) await handler(ctx, payload);
}
