import type { LogicalReplicationService } from 'pg-logical-replication';
import { getIsoDate } from '#/utils/iso-date';
import { resourceLimits } from '../constants';

const { delaysMs } = resourceLimits.reread;
const { rereadUnhealthyMs } = resourceLimits.health;

/** The failure the worker is reading again from. A type alias: the health report's `failure` is a record, which an interface does not satisfy. */
export type ReplicationFailure = {
  /** The first change of the flush that failed; null when no subscription could start and none had failed before. */
  position: string | null;
  /** When the first failure at this position was, whatever its cause: how long the worker has made no progress. */
  since: string;
  /** The message of the last failure. */
  error: string;
};

class ReplicationStateManager {
  /** True from the moment the loop subscribes until that subscription ends. */
  subscribed = false;
  /** The service of the subscription the loop holds or held last. */
  service: LogicalReplicationService | null = null;
  /** Set at shutdown: the subscription loop ends with the subscription it holds. */
  stopping = false;

  /** The last position acknowledged to the slot. The status timer repeats it while a flush holds the stream. */
  lastAckedLsn: string | null = null;
  /** Position of the latest keepalive: everything committed before it was already streamed to this worker. */
  lastKeepaliveLsn: string | null = null;

  /** Generation of the books, from `sync_state`: health reports it, and the API tells clients when it moved. */
  generation = 1;
  /** What the last setup check found wrong; while it is not empty the worker does not read. */
  setupProblems: string[] = [];

  /** The failure the worker is reading again from; null once the worker got past it. */
  failure: ReplicationFailure | null = null;
  /** Failed flushes and subscriptions since the worker last got past a failure: it sets the wait before the next read. */
  private failuresInARow = 0;

  /** How long ago the source transaction the worker read last committed; null before the first one. */
  lagMs: number | null = null;
  /** When the worker last read a change it keeps; null before the first one. */
  lastEventAt: Date | null = null;

  /**
   * True once the worker has read again for `rereadUnhealthyMs` without getting past its failure, whatever the cause:
   * health reports it unhealthy, and at the WAL bound the slot is dropped. The WAL waits behind it until then.
   */
  get stalled(): boolean {
    return this.failure !== null && Date.now() - Date.parse(this.failure.since) > rereadUnhealthyMs;
  }

  /** Records a failed flush, or a failed subscription at the position of the failure it reads again from. */
  recordFailure(position: string | null, error: unknown): void {
    this.failuresInARow += 1;
    const since = this.failure?.position === position ? this.failure.since : getIsoDate();
    this.failure = { position, since, error: error instanceof Error ? error.message : String(error) };
  }

  /** A position was acknowledged, or the books were rebuilt for a new slot: whatever failed before is behind the worker. */
  clearFailure(): void {
    this.failure = null;
    this.failuresInARow = 0;
  }

  /** How long to wait before the stream is read again after a failure: longer with every failure in a row. */
  get rereadDelayMs(): number {
    return delaysMs[Math.min(Math.max(this.failuresInARow, 1), delaysMs.length) - 1];
  }

  /** For tests: every field as a worker that just started holds it. */
  reset(): void {
    Object.assign(this, new ReplicationStateManager());
  }
}

/** What the worker knows about its own reading: one object, so the loop, the handlers and health read the same facts. */
export const replicationState = new ReplicationStateManager();
