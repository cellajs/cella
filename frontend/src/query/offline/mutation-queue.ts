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
 * Coalesce or cancel only offline-paused mutations that cannot yet have committed remotely.
 * Online intent stays separate and scope-serialized for backend idempotency and LWW handling.
 */
export function canCoalesce(): boolean {
  return !onlineManager.isOnline();
}
