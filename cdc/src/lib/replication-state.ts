import type { LogicalReplicationService } from 'pg-logical-replication';

/** Replication state for health monitoring */
export type ReplicationState = 'active' | 'paused' | 'stopped';

/**
 * Centralized state management for CDC replication.
 * Encapsulates module-level state with getters/setters for testability.
 */
class ReplicationStateManager {
  private _replicationState: ReplicationState = 'stopped';
  private _lastLsn: string | null = null;
  private _service: LogicalReplicationService | null = null;
  private _replicationPausedAt: Date | null = null;

  /** Get current replication state */
  get replicationState(): ReplicationState {
    return this._replicationState;
  }

  /** Set replication state */
  set replicationState(state: ReplicationState) {
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

  /**
   * Reset all state (for testing).
   */
  reset(): void {
    this._replicationState = 'stopped';
    this._lastLsn = null;
    this._service = null;
    this._replicationPausedAt = null;
  }
}

/** Singleton state manager instance */
export const replicationState = new ReplicationStateManager();
