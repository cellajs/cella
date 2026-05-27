import { logEvent } from '../lib/pino';

type CircuitState = 'closed' | 'open' | 'half_open';

interface CircuitEntry {
  state: CircuitState;
  /** Consecutive failure count (resets on success) */
  failureCount: number;
  /** Total events skipped while circuit is open */
  skippedCount: number;
  /** When the circuit was opened */
  openedAt: number | null;
  /** When the last failure occurred */
  lastFailureAt: number | null;
}

/** Consecutive failures before the circuit opens */
const FAILURE_THRESHOLD = 3;

/** How long the circuit stays open before testing recovery (ms) */
const COOLDOWN_MS = 60_000;

/**
 * Per-table circuit breaker for CDC event processing.
 *
 * Prevents a single table's persistent failures from blocking the entire
 * pipeline. When a table hits consecutive failure threshold, its circuit
 * opens — events are skipped (LSN acked, logged) until the cooldown expires
 * and a test event succeeds.
 *
 * States:
 *   CLOSED    → normal processing
 *   OPEN      → skip events, wait for cooldown
 *   HALF_OPEN → test one event; success → CLOSED, failure → OPEN
 */
class CircuitBreaker {
  private circuits = new Map<string, CircuitEntry>();

  private getOrCreate(tableName: string): CircuitEntry {
    let entry = this.circuits.get(tableName);
    if (!entry) {
      entry = { state: 'closed', failureCount: 0, skippedCount: 0, openedAt: null, lastFailureAt: null };
      this.circuits.set(tableName, entry);
    }
    return entry;
  }

  /**
   * Check whether an event for this table should be processed.
   * Returns true if processing should proceed, false if the event should be skipped.
   */
  shouldProcess(tableName: string): boolean {
    const entry = this.getOrCreate(tableName);

    if (entry.state === 'closed') return true;
    if (entry.state === 'half_open') return true;

    // State is 'open' — check if cooldown has elapsed
    const now = Date.now();
    if (entry.openedAt && now - entry.openedAt >= COOLDOWN_MS) {
      entry.state = 'half_open';
      logEvent('warn', `Circuit HALF_OPEN for table '${tableName}' — testing recovery`, {
        skippedCount: entry.skippedCount,
        openDurationMs: now - entry.openedAt,
      });
      return true;
    }

    // Still in cooldown — skip
    entry.skippedCount++;
    return false;
  }

  /**
   * Record a processing failure for a table.
   * If consecutive failures hit the threshold, opens the circuit.
   */
  recordFailure(tableName: string): void {
    const entry = this.getOrCreate(tableName);
    entry.failureCount++;
    entry.lastFailureAt = Date.now();

    if (entry.state === 'half_open') {
      // Recovery test failed — reopen
      entry.state = 'open';
      entry.openedAt = Date.now();
      logEvent('warn', `Circuit re-OPENED for table '${tableName}' — recovery test failed`, {
        failureCount: entry.failureCount,
        skippedCount: entry.skippedCount,
      });
      return;
    }

    if (entry.failureCount >= FAILURE_THRESHOLD && entry.state === 'closed') {
      entry.state = 'open';
      entry.openedAt = Date.now();
      entry.skippedCount = 0;
      logEvent('warn', `Circuit OPEN for table '${tableName}' — ${FAILURE_THRESHOLD} consecutive failures`, {
        failureCount: entry.failureCount,
      });
    }
  }

  /**
   * Record a processing success for a table.
   * Resets the circuit to closed.
   */
  recordSuccess(tableName: string): void {
    const entry = this.circuits.get(tableName);
    if (!entry || (entry.state === 'closed' && entry.failureCount === 0)) return;

    const wasOpen = entry.state !== 'closed';
    const skipped = entry.skippedCount;

    entry.state = 'closed';
    entry.failureCount = 0;
    entry.skippedCount = 0;
    entry.openedAt = null;

    if (wasOpen) {
      logEvent('info', `Circuit CLOSED for table '${tableName}' — recovered`, {
        skippedCount: skipped,
      });
    }
  }

  /**
   * Get status of all circuits for health reporting.
   */
  getStatus(): Record<string, { state: CircuitState; failureCount: number; skippedCount: number }> {
    const status: Record<string, { state: CircuitState; failureCount: number; skippedCount: number }> = {};
    for (const [table, entry] of this.circuits) {
      if (entry.state !== 'closed' || entry.failureCount > 0) {
        status[table] = { state: entry.state, failureCount: entry.failureCount, skippedCount: entry.skippedCount };
      }
    }
    return status;
  }
}

export const circuitBreaker = new CircuitBreaker();
