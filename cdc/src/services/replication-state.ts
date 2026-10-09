import type { LogicalReplicationService } from 'pg-logical-replication';
import { RESOURCE_LIMITS } from '../constants';
import { isPassingError } from './failure';

const { delaysMs, stuckAfter } = RESOURCE_LIMITS.reread;

/** The failure the worker is reading again from. */
export interface ReplicationFailure {
  /** The position the failure belongs to: the first change of the flush that failed. */
  position: string;
  /** Failures in a row at this position that the change itself caused. */
  count: number;
  error: string;
  /** Whether the last failure said nothing about the change: a connection, a lock, the API being away. */
  passing: boolean;
}

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

  /** The failure the worker is reading again from; null once a flush got past it. */
  failure: ReplicationFailure | null = null;
  /** Failed flushes since the last one that was recorded, passing ones too: it sets the wait before the next read. */
  private failuresInARow = 0;

  /** How long ago the source transaction the worker read last committed; null before the first one. */
  lagMs: number | null = null;
  /** When the worker last read a change it keeps; null before the first one. */
  lastEventAt: Date | null = null;

  /**
   * True when the same position failed `stuckAfter` times in a row because of the change itself. The worker keeps
   * reading again, and the WAL waits behind it.
   */
  get stuck(): boolean {
    return this.failure !== null && this.failure.count >= stuckAfter;
  }

  /**
   * Records a failed flush. Failures the change caused are counted per position; a passing one neither adds to that
   * count nor clears it.
   */
  recordFailure(position: string, error: unknown): void {
    this.failuresInARow += 1;
    const passing = isPassingError(error);
    const message = error instanceof Error ? error.message : String(error);
    const before = this.failure?.position === position ? this.failure.count : 0;
    this.failure = { position, count: passing ? before : before + 1, error: message, passing };
  }

  /** A flush was recorded: whatever failed before is behind the worker. */
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
