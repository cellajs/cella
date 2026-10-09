import type { LogicalReplicationService } from 'pg-logical-replication';
import { RESOURCE_LIMITS } from '../constants';
import { isPassingError } from './failure';

const { delaysMs, stuckAfter } = RESOURCE_LIMITS.reread;

/** `active`: reading the stream. `paused`: the API is away, so nothing is consumed. `stopped`: no subscription. */
type ReplicationState = 'active' | 'paused' | 'stopped';

/** The failure the worker is reading again from. */
export interface ReplicationFailure {
  /** The LSN the failure belongs to: the first event of the flush that failed. */
  position: string;
  /** Failures in a row at this position that the change itself caused. */
  count: number;
  error: string;
  /** Whether the last failure said nothing about the change: a connection, a lock, the API being away. */
  passing: boolean;
}

class ReplicationStateManager {
  private _replicationState: ReplicationState = 'stopped';
  private _lastLsn: string | null = null;
  private _lastAckedLsn: string | null = null;
  private _service: LogicalReplicationService | null = null;

  /** Position of the latest keepalive: everything committed before it was already streamed to this worker. */
  lastKeepaliveLsn: string | null = null;
  private _replicationPausedAt: Date | null = null;

  /** Generation of the books, from `sync_state`: health reports it, and the API tells clients when it moved. */
  generation = 1;
  /** Set when a rebuild was asked for: the subscription loop runs it between two subscriptions. */
  rebuildRequested = false;

  /** What the last setup check found wrong; while it is not empty the worker does not read. */
  setupProblems: string[] = [];

  /** Set when a flush failed: the subscription loop waits before it reads the same events again. */
  flushFailed = false;
  /** Set at shutdown: the subscription loop ends with the subscription it holds. */
  stopping = false;

  private _failure: ReplicationFailure | null = null;
  private failuresInARow = 0;
  private _lagMs: number | null = null;
  private _lastEventAt: Date | null = null;

  get status(): ReplicationState {
    return this._replicationState;
  }

  set status(state: ReplicationState) {
    this._replicationState = state;
  }

  /** Last processed LSN. */
  get lastLsn(): string | null {
    return this._lastLsn;
  }

  set lastLsn(lsn: string | null) {
    this._lastLsn = lsn;
  }

  /** Last LSN reported to Postgres as flushed. Heartbeats repeat it, so the slot never advances past data still buffered. */
  get lastAckedLsn(): string | null {
    return this._lastAckedLsn;
  }

  set lastAckedLsn(lsn: string | null) {
    this._lastAckedLsn = lsn;
  }

  get service(): LogicalReplicationService | null {
    return this._service;
  }

  set service(svc: LogicalReplicationService | null) {
    this._service = svc;
  }

  /** Since when the API is away; null while it is reachable. */
  get replicationPausedAt(): Date | null {
    return this._replicationPausedAt;
  }

  /** The API is reachable again, whatever the subscription is doing: between two reads the status is `stopped`. */
  markApiBack(): void {
    this._replicationPausedAt = null;
    if (this._replicationState === 'paused') this._replicationState = 'active';
  }

  /** The API went away: flushes wait for it. A subscription that is reading shows as `paused`. */
  markApiAway(): void {
    this._replicationPausedAt ??= new Date();
    if (this._replicationState === 'active') this._replicationState = 'paused';
  }

  /** A new subscription waits for the API before it takes the slot. */
  markPaused(): void {
    this._replicationState = 'paused';
    this._replicationPausedAt ??= new Date();
  }

  markStopped(): void {
    this._replicationState = 'stopped';
  }

  /** The failure the worker is reading again from; null once a flush got past it. */
  get failure(): ReplicationFailure | null {
    return this._failure;
  }

  /**
   * True when the same position failed `stuckAfter` times in a row because of the change itself. The worker keeps
   * reading again, and the WAL waits behind it.
   */
  get stuck(): boolean {
    return this._failure !== null && this._failure.count >= stuckAfter;
  }

  /**
   * Records a failed flush. Failures the change caused are counted per position; a passing one neither adds to that
   * count nor clears it.
   */
  recordFailure(position: string, error: unknown): void {
    this.flushFailed = true;
    this.failuresInARow += 1;
    const passing = isPassingError(error);
    const message = error instanceof Error ? error.message : String(error);
    const samePosition = this._failure?.position === position;
    const before = samePosition ? (this._failure?.count ?? 0) : 0;
    this._failure = { position, count: passing ? before : before + 1, error: message, passing };
  }

  /** A flush was recorded and acknowledged: whatever failed before is behind the worker. */
  clearFailure(): void {
    this._failure = null;
    this.failuresInARow = 0;
  }

  /** How long to wait before the stream is read again after a failure: longer with every failure in a row. */
  get rereadDelayMs(): number {
    return delaysMs[Math.min(Math.max(this.failuresInARow, 1), delaysMs.length) - 1];
  }

  /** How long ago the transaction the worker read last committed; null before the first one. */
  get lagMs(): number | null {
    return this._lagMs;
  }

  set lagMs(lagMs: number | null) {
    this._lagMs = lagMs;
  }

  /** Null when no DML change has been applied this run. */
  get lastEventAt(): Date | null {
    return this._lastEventAt;
  }

  /** Stamp the time of the most recently applied DML change. */
  markEvent(): void {
    this._lastEventAt = new Date();
  }

  /** Test helper. */
  reset(): void {
    this._replicationState = 'stopped';
    this._lastLsn = null;
    this._lastAckedLsn = null;
    this.lastKeepaliveLsn = null;
    this._service = null;
    this._replicationPausedAt = null;
    this.generation = 1;
    this.rebuildRequested = false;
    this.setupProblems = [];
    this.flushFailed = false;
    this.stopping = false;
    this._failure = null;
    this.failuresInARow = 0;
    this._lagMs = null;
    this._lastEventAt = null;
  }
}

export const replicationState = new ReplicationStateManager();
