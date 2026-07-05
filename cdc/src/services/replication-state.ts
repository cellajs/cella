import type { LogicalReplicationService } from 'pg-logical-replication';
import { RESOURCE_LIMITS } from '../constants';
import { log } from '../lib/pino';

const { enterLagMs, exitLagMs, exitConsecutiveLive } = RESOURCE_LIMITS.catchup;

/** Replication state for health monitoring */
type ReplicationState = 'active' | 'paused' | 'stopped';

/**
 * Centralized state management for CDC replication.
 * Encapsulates module-level state with getters/setters for testability.
 */
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

  /** Get current replication status */
  get status(): ReplicationState {
    return this._replicationState;
  }

  /** Set replication status */
  set status(state: ReplicationState) {
    this._replicationState = state;
  }

  /** Get last processed LSN */
  get lastLsn(): string | null {
    return this._lastLsn;
  }

  /** Set last processed LSN */
  set lastLsn(lsn: string | null) {
    this._lastLsn = lsn;
  }

  /** Get replication service instance */
  get service(): LogicalReplicationService | null {
    return this._service;
  }

  /** Set replication service instance */
  set service(svc: LogicalReplicationService | null) {
    this._service = svc;
  }

  /** Get time when replication was paused (null if not paused) */
  get replicationPausedAt(): Date | null {
    return this._replicationPausedAt;
  }

  /** Set time when replication was paused */
  set replicationPausedAt(date: Date | null) {
    this._replicationPausedAt = date;
  }

  /**
   * Mark replication as active (WebSocket connected).
   */
  markActive(): void {
    this._replicationState = 'active';
    this._replicationPausedAt = null;
  }

  /**
   * Mark replication as paused (WebSocket disconnected).
   */
  markPaused(): void {
    this._replicationState = 'paused';
    this._replicationPausedAt = new Date();
  }

  /**
   * Mark replication as stopped.
   */
  markStopped(): void {
    this._replicationState = 'stopped';
  }

  // ── Catchup mode ───────────────────────────────────────────────────────

  /** Whether the worker is replaying old WAL events */
  get catchingUp(): boolean {
    return this._catchingUp;
  }

  /** When catchup started (epoch ms), null if not catching up */
  get catchupStartedAt(): number | null {
    return this._catchupStartedAt;
  }

  /** Number of events processed during current catchup */
  get catchupEventsProcessed(): number {
    return this._catchupEventsProcessed;
  }

  /** Last measured WAL lag in milliseconds */
  get lastLagMs(): number | null {
    return this._lastLagMs;
  }

  /** When the last DML change was applied (null if none yet this run) */
  get lastEventAt(): Date | null {
    return this._lastEventAt;
  }

  /** Stamp the time of the most recently applied DML change. */
  markEvent(): void {
    this._lastEventAt = new Date();
  }

  /** Increment catchup event counter */
  incrementCatchupEvents(count = 1): void {
    this._catchupEventsProcessed += count;
  }

  /**
   * Update WAL lag from a BEGIN message's commitTime.
   * Manages catchup mode enter/exit with hysteresis.
   *
   * @returns true if currently in catchup mode (after this update)
   */
  updateLag(lagMs: number): boolean {
    this._lastLagMs = lagMs;

    if (!this._catchingUp) {
      // Not in catchup — check if we should enter
      if (lagMs > enterLagMs) {
        this._catchingUp = true;
        this._catchupStartedAt = Date.now();
        this._catchupEventsProcessed = 0;
        this._consecutiveLiveTxns = 0;
        log.info('Entering catchup mode — WAL lag exceeds threshold', {
          lagMs: Math.round(lagMs),
          thresholdMs: enterLagMs,
        });
      }
      return this._catchingUp;
    }

    // In catchup — check if we should exit
    if (lagMs < exitLagMs) {
      this._consecutiveLiveTxns++;
      if (this._consecutiveLiveTxns >= exitConsecutiveLive) {
        const duration = Date.now() - (this._catchupStartedAt ?? Date.now());
        log.info('Exiting catchup mode — WAL lag below threshold', {
          lagMs: Math.round(lagMs),
          consecutiveLive: this._consecutiveLiveTxns,
          catchupDurationMs: duration,
          eventsProcessed: this._catchupEventsProcessed,
        });
        this._catchingUp = false;
        return false;
      }
    } else {
      // Reset consecutive live counter if lag spikes back up
      this._consecutiveLiveTxns = 0;
    }

    return this._catchingUp;
  }

  /**
   * Reset catchup state after post-catchup recovery completes.
   */
  resetCatchup(): void {
    this._catchupStartedAt = null;
    this._catchupEventsProcessed = 0;
    this._consecutiveLiveTxns = 0;
  }

  /**
   * Reset all state (for testing).
   */
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

/** Singleton state manager instance */
export const replicationState = new ReplicationStateManager();
