import type { TrackedEventType } from 'shared';
import type { AuthContext } from '#/core/context';
import { onBackendModuleRegister } from '#/lib/module';

/** The batched rows an event is about: `before`/`after` index-aligned for updates, `before` alone for deletes. */
export interface MutationPayload {
  before?: Record<string, unknown>[];
  after?: Record<string, unknown>[];
  /** True for writes from Yjs materialization; handlers that would double-process those re-writes return early. */
  serverOrigin?: boolean;
}

export type MutationHandler = (ctx: AuthContext, payload: MutationPayload) => Promise<void>;

const handlers = new Map<TrackedEventType, MutationHandler[]>();

/** Direct registration, for cross-module handlers derived from other modules' declarations (e.g. mention derivation). */
export function registerMutationHandler(event: TrackedEventType, handler: MutationHandler): void {
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

/** Awaits handlers in registration order, rejecting on the first error. Pass a transactional ctx to join the write. */
export async function dispatchMutation(
  ctx: AuthContext,
  event: TrackedEventType,
  payload: MutationPayload = {},
): Promise<void> {
  for (const handler of handlers.get(event) ?? []) await handler(ctx, payload);
}
