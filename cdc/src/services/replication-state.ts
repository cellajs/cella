import type { LogicalReplicationService } from 'pg-logical-replication';
import { RESOURCE_LIMITS } from '../constants';
import { log } from '../lib/pino';

const { enterLagMs, exitLagMs, exitConsecutiveLive } = RESOURCE_LIMITS.catchup;

type ReplicationState = 'active' | 'paused' | 'stopped';

class ReplicationStateManager {
  private _replicationState: ReplicationState = 'stopped';
  private _lastLsn: string | null = null;
  private _service: LogicalReplicationService | null = null;
  private _replicationPausedAt: Date | null = null;

  // Catchup mode state
  private _catchingUp = false;
  private _catchupStartedAt: number | null = null;
  private _catchupEventsProcessed = 0;
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

  /** True while the worker is replaying old WAL events. */
  get catchingUp(): boolean {
    return this._catchingUp;
  }

  /** Epoch ms, null when not catching up. */
  get catchupStartedAt(): number | null {
    return this._catchupStartedAt;
  }

  get catchupEventsProcessed(): number {
    return this._catchupEventsProcessed;
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

  incrementCatchupEvents(count = 1): void {
    this._catchupEventsProcessed += count;
  }

  /**
   * Records WAL lag from a BEGIN message's commitTime and enters or exits catchup mode with hysteresis.
   *
   * @returns whether catchup mode is active after this update.
   */
  updateLag(lagMs: number): boolean {
    this._lastLagMs = lagMs;

    if (!this._catchingUp) {
      if (lagMs > enterLagMs) {
        this._catchingUp = true;
        this._catchupStartedAt = Date.now();
        this._catchupEventsProcessed = 0;
        this._consecutiveLiveTxns = 0;
        log.info('Entering catchup mode: WAL lag exceeds threshold', {
          lagMs: Math.round(lagMs),
          thresholdMs: enterLagMs,
        });
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
          eventsProcessed: this._catchupEventsProcessed,
        });
        this._catchingUp = false;
        return false;
      }
    } else {
      // A lag spike restarts the consecutive-live count.
      this._consecutiveLiveTxns = 0;
    }

    return this._catchingUp;
  }

  /** Called once post-catchup recovery completes. */
  resetCatchup(): void {
    this._catchupStartedAt = null;
    this._catchupEventsProcessed = 0;
    this._consecutiveLiveTxns = 0;
  }

  /** Test helper. */
  reset(): void {
    this._replicationState = 'stopped';
    this._lastLsn = null;
    this._service = null;
    this._replicationPausedAt = null;
    this._catchingUp = false;
    this._catchupStartedAt = null;
    this._catchupEventsProcessed = 0;
    this._consecutiveLiveTxns = 0;
    this._lastLagMs = null;
    this._lastEventAt = null;
  }
}

export const replicationState = new ReplicationStateManager();
