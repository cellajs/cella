import { wsClient } from '../network/websocket-client';
import { replicationState } from './replication-state';

/** `active`: reading the stream. `paused`: the API is away, so nothing is recorded. `stopped`: no subscription. */
export type ReplicationStatus = 'active' | 'paused' | 'stopped';

/**
 * The status the worker publishes, from the two facts it keeps: whether the API is away (the socket knows) and whether
 * a subscription is open (the loop knows). Health, the status metric and the verify schedule read it here.
 */
export function replicationStatus(): ReplicationStatus {
  if (wsClient.apiAwaySince) return 'paused';
  return replicationState.subscribed ? 'active' : 'stopped';
}
