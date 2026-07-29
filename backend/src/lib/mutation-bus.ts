import type { TrackedEventType } from 'shared';
import type { AuthContext } from '#/core/context';
import { onBackendModuleRegister } from '#/lib/module';

/**
 * Batch payload: the rows the event is about. cella ops work in batches, so the bus does too.
 * `before`/`after` are index-aligned for updates; a create carries `after`, a delete carries
 * `before` (the deleted rows, which already hold the op's `deletedAt`/`deletedBy`). Handlers
 * narrow rows to their entity type.
 */
export interface MutationPayload {
  before?: Record<string, unknown>[];
  after?: Record<string, unknown>[];
  /**
   * True when the write originates from Yjs materialization (server-origin). Handlers that would
   * double-process on those re-writes should return early.
   */
  serverOrigin?: boolean;
}

export type MutationHandler = (ctx: AuthContext, payload: MutationPayload) => Promise<void>;

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

/**
 * Fire the handlers registered for `<type>.<verb>` synchronously, in registration order, awaiting
 * each. Rejects on the first handler error so an operation can let a failed requirement abort the
 * request. Pass the transactional ctx when handlers must run inside the write's transaction.
 */
export async function dispatchMutation(
  ctx: AuthContext,
  event: TrackedEventType,
  payload: MutationPayload = {},
): Promise<void> {
  for (const handler of handlers.get(event) ?? []) await handler(ctx, payload);
}
