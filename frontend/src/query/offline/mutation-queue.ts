import { onlineManager } from '@tanstack/react-query';

/** Minimal shape of a mutation's observable state; avoids depending on the generic Mutation type. */
type MutationLike = { state: { status: string; isPaused: boolean } };

/** Parked offline awaiting reconnect. The only state coalescing may merge into or cancel, since it cannot have completed a server round trip. */
export function isQueued(mutation: MutationLike): boolean {
  return mutation.state.status === 'pending' && mutation.state.isPaused;
}

/** Any pending mutation (active or queued). True while a remote cache write should defer to optimistic state. */
export function isPending(mutation: MutationLike): boolean {
  return mutation.state.status === 'pending';
}

/** Only offline-paused mutations may be coalesced or cancelled; online intent stays separate and scope-serialized for backend idempotency and LWW handling. */
export function canCoalesce(): boolean {
  return !onlineManager.isOnline();
}
