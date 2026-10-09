import type { LogicalReplicationService } from 'pg-logical-replication';
import { RESOURCE_LIMITS } from '../constants';
import { log } from '../lib/pino';

const { enterLagMs, exitLagMs, exitConsecutiveLive } = RESOURCE_LIMITS.catchup;

type ReplicationState = 'active' | 'paused' | 'stopped';

class ReplicationStateManager {
  private _replicationState: ReplicationState = 'stopped';
  private _lastLsn: string | null = null;
  private _lastAckedLsn: string | null = null;
  private _service: LogicalReplicationService | null = null;

  /** Position of the latest keepalive: everything committed before it was already streamed to this worker. */
  lastKeepaliveLsn: string | null = null;
  /** Latest position whose acknowledgment was withheld, until the next one that is sent. */
  heldAckLsn: string | null = null;
  private _replicationPausedAt: Date | null = null;

  // Catchup mode state
  /** Set when a flush failed: the subscription loop waits before it reads the same events again. */
  flushFailed = false;

  private _catchingUp = false;
  private _catchupStartedAt: number | null = null;
  private _consecutiveLiveTxns = 0;
  private _lastLagMs: number | null = null;
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

  /** Last LSN reported to Postgres as flushed. Heartbeats repeat it, so the slot never advances past data still buffered or held. */
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

  /** Null while replication is not paused. */
  get replicationPausedAt(): Date | null {
    return this._replicationPausedAt;
  }

  set replicationPausedAt(date: Date | null) {
    this._replicationPausedAt = date;
  }

  /** WebSocket connected. */
  markActive(): void {
    this._replicationState = 'active';
    this._replicationPausedAt = null;
  }

  /** WebSocket disconnected. */
  markPaused(): void {
    this._replicationState = 'paused';
    this._replicationPausedAt = new Date();
  }

  markStopped(): void {
    this._replicationState = 'stopped';
  }

  // ── Catchup mode ───────────────────────────────────────────────────────

  /** True while the worker reads changes that committed a while ago. A status for health alone: it changes no processing. */
  get catchingUp(): boolean {
    return this._catchingUp;
  }

  /** Epoch ms, null when not catching up. */
  get catchupStartedAt(): number | null {
    return this._catchupStartedAt;
  }

  /** Last measured WAL lag in ms. */
  get lastLagMs(): number | null {
    return this._lastLagMs;
  }

  /** Null when no DML change has been applied this run. */
  get lastEventAt(): Date | null {
    return this._lastEventAt;
  }

  /** Stamp the time of the most recently applied DML change. */
  markEvent(): void {
    this._lastEventAt = new Date();
  }

  /**
   * Records how far behind the worker is, from the commit time of the transaction it reads, and sets or clears the
   * catching-up status with hysteresis.
   *
   * @returns whether the worker counts as catching up after this update.
   */
  updateLag(lagMs: number): boolean {
    this._lastLagMs = lagMs;

    if (!this._catchingUp) {
      if (lagMs > enterLagMs) {
        this._catchingUp = true;
        this._catchupStartedAt = Date.now();
        this._consecutiveLiveTxns = 0;
        log.info('Entering catchup mode: WAL lag exceeds threshold', { lagMs: Math.round(lagMs), thresholdMs: enterLagMs });
      }
      return this._catchingUp;
    }

    if (lagMs < exitLagMs) {
      this._consecutiveLiveTxns++;
      if (this._consecutiveLiveTxns >= exitConsecutiveLive) {
        const duration = Date.now() - (this._catchupStartedAt ?? Date.now());
        log.info('Exiting catchup mode: WAL lag below threshold', {
          lagMs: Math.round(lagMs),
          consecutiveLive: this._consecutiveLiveTxns,
          catchupDurationMs: duration,
        });
        this._catchingUp = false;
        this._catchupStartedAt = null;
        this._consecutiveLiveTxns = 0;
        return false;
      }
    } else {
      // A lag spike restarts the consecutive-live count.
      this._consecutiveLiveTxns = 0;
    }

    return this._catchingUp;
  }

  /** Test helper. */
  reset(): void {
    this._replicationState = 'stopped';
    this._lastLsn = null;
    this._lastAckedLsn = null;
    this.lastKeepaliveLsn = null;
    this.heldAckLsn = null;
    this._service = null;
    this._replicationPausedAt = null;
    this._catchingUp = false;
    this._catchupStartedAt = null;
    this._consecutiveLiveTxns = 0;
    this._lastLagMs = null;
    this._lastEventAt = null;
  }
}

export const replicationState = new ReplicationStateManager();
