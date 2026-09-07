import { onlineManager } from '@tanstack/react-query';

/** Minimal shape of a mutation's observable state; avoids depending on the generic Mutation type. */
type MutationLike = { state: { status: string; isPaused: boolean } };

/** Executing on the wire: its variables are committed to a request, so coalescing must never merge into it or remove it. */
export function isActive(mutation: MutationLike): boolean {
  return mutation.state.status === 'pending' && !mutation.state.isPaused;
}

/** Parked offline awaiting reconnect. The only state coalescing may merge into or cancel, since it cannot have completed a server round trip. */
export function isQueued(mutation: MutationLike): boolean {
  return mutation.state.status === 'pending' && mutation.state.isPaused;
}

/** Any pending mutation (active or queued). True while a remote cache write should defer to optimistic state. */
export function isPending(mutation: MutationLike): boolean {
  return mutation.state.status === 'pending';
}

/** Mutation ids that paused offline at least once, in this session or restored from the persisted cache. */
const pausedMutationIds = new Set<string>();

/** Records a mutation as having paused; the mutation cache subscription in the query client calls it. */
export function recordPausedMutation(mutationId: string): void {
  pausedMutationIds.add(mutationId);
}

/** True for a mutation that paused while offline; the server treats its write as a replay. */
export function hasPaused(mutationId: string): boolean {
  return pausedMutationIds.has(mutationId);
}

/** Only offline-paused mutations may be coalesced or cancelled; online intent stays separate and scope-serialized for backend idempotency and LWW handling. */
export function canCoalesce(): boolean {
  return !onlineManager.isOnline();
}
