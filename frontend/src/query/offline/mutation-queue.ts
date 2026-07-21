import { onlineManager } from '@tanstack/react-query';

/** Minimal shape of a mutation's observable state; avoids depending on the generic Mutation type. */
type MutationLike = { state: { status: string; isPaused: boolean } };

/**
 * A mutation currently executing (on the wire). Its variables are committed to a request, so
 * coalescing must never merge into it or remove it.
 */
export function isActive(mutation: MutationLike): boolean {
  return mutation.state.status === 'pending' && !mutation.state.isPaused;
}

/**
 * A mutation parked offline awaiting reconnect. This is the only state coalescing may merge into
 * or cancel: while offline it cannot have completed a server round trip.
 */
export function isQueued(mutation: MutationLike): boolean {
  return mutation.state.status === 'pending' && mutation.state.isPaused;
}

/** Any pending mutation (active or queued). True while a remote cache write should defer to optimistic state. */
export function isPending(mutation: MutationLike): boolean {
  return mutation.state.status === 'pending';
}

/**
 * Coalescing (folding later intent into a queued mutation, or cancelling a queued create) is only
 * safe while offline. A queued mutation is paused because connectivity is down, so it has not
 * committed a server change; merging or cancelling cannot lose one. Once back online we issue
 * separate, scope-serialized mutations and let backend idempotency + field-timestamp LWW arbitrate.
 *
 * Checked synchronously immediately before the merge, so the window where connectivity returns
 * between this check and the merge is a single synchronous block.
 */
export function canCoalesce(): boolean {
  return !onlineManager.isOnline();
}
