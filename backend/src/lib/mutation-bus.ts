import type { TrackedEventType } from 'shared';
import type { ActorContext } from '#/core/context';
import { onBackendModuleRegister } from '#/lib/module';
import type { TrackedModel, TrackedType } from '#/tables';

/** The tracked type an event is about: `task` of `task.updated`. */
type SubjectOf<E extends TrackedEventType> = E extends `${infer T extends TrackedType}.${string}` ? T : never;

/** The batched rows an event is about: `before`/`after` index-aligned for updates, `before` alone for deletes. */
export interface MutationPayload<E extends TrackedEventType = TrackedEventType> {
  before?: TrackedModel<SubjectOf<E>>[];
  after?: TrackedModel<SubjectOf<E>>[];
}

/** A module's reaction to one event, awaited inside the request that dispatched it. */
export type MutationHandler<E extends TrackedEventType = TrackedEventType> = (ctx: ActorContext, payload: MutationPayload<E>) => Promise<void>;

const handlers = new Map<TrackedEventType, MutationHandler[]>();

// Index the `onMutation` handlers each backend module declares (see defineBackendModule).
onBackendModuleRegister((module) => {
  for (const entry of Object.entries(module.onMutation ?? {})) {
    // Stored under its own event, a handler is called only with that event's rows.
    const [event, handler] = entry as [TrackedEventType, MutationHandler];
    const existing = handlers.get(event);
    if (existing) existing.push(handler);
    else handlers.set(event, [handler]);
  }
});

/** Awaits handlers in registration order, rejecting on the first error. Pass a transactional ctx to join the write. */
export async function dispatchMutation<E extends TrackedEventType>(ctx: ActorContext, event: E, payload: MutationPayload<E> = {}): Promise<void> {
  for (const handler of handlers.get(event) ?? []) await handler(ctx, payload);
}
