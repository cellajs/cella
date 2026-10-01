import type { TrackedEventType } from 'shared';
import type { ActorContext } from '#/core/context';
import { onBackendModuleRegister } from '#/lib/module';

/** The batched rows an event is about: `before`/`after` index-aligned for updates, `before` alone for deletes. */
export interface MutationPayload {
  before?: Record<string, unknown>[];
  after?: Record<string, unknown>[];
  /**
   * True for the Yjs relay's own materialization of a collaborative document; handlers that would double-process those
   * re-writes return early. Not the same as a server-built write (an MCP tool), which is an edit like a client's.
   */
  materialized?: boolean;
  /** True when the op ran `prepareMutation` and wrote the columns it derived; handlers deriving those skip. */
  prepared?: boolean;
}

export type MutationHandler = (ctx: ActorContext, payload: MutationPayload) => Promise<void>;

/** Server-owned columns derived from the rows about to be written, index-aligned with `after`. */
export type PrepareHandler = (
  ctx: ActorContext,
  payload: MutationPayload,
) => Promise<(Record<string, unknown> | undefined)[]>;

const handlers = new Map<TrackedEventType, MutationHandler[]>();
const prepareHandlers = new Map<TrackedEventType, PrepareHandler[]>();

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

/** Direct registration of a pre-write derivation (e.g. mention derivation); `prepareMutation` runs it. */
export function registerPrepareHandler(event: TrackedEventType, handler: PrepareHandler): void {
  const existing = prepareHandlers.get(event);
  if (existing) existing.push(handler);
  else prepareHandlers.set(event, [handler]);
}

/**
 * Runs before the write, with `after` holding the rows about to be written: returns per row the
 * server-owned columns to write in the same statement. A column written by a second statement
 * would reach the CDC worker as a second update, so one edit would become two activities. The op
 * then dispatches with `prepared: true`.
 */
export async function prepareMutation(
  ctx: ActorContext,
  event: TrackedEventType,
  payload: MutationPayload,
): Promise<Record<string, unknown>[]> {
  const derived = (payload.after ?? []).map(() => ({}));
  for (const handler of prepareHandlers.get(event) ?? []) {
    const columns = await handler(ctx, payload);
    columns.forEach((values, index) => {
      if (values && derived[index]) Object.assign(derived[index], values);
    });
  }
  return derived;
}

/** Awaits handlers in registration order, rejecting on the first error. Pass a transactional ctx to join the write. */
export async function dispatchMutation(
  ctx: ActorContext,
  event: TrackedEventType,
  payload: MutationPayload = {},
): Promise<void> {
  for (const handler of handlers.get(event) ?? []) await handler(ctx, payload);
}
