import { log } from '../lib/pino';

type CircuitState = 'closed' | 'open' | 'half_open';

interface CircuitEntry {
  state: CircuitState;
  /** Consecutive failures; resets on success. */
  failureCount: number;
  /** Events skipped while the circuit was open. */
  skippedCount: number;
  /** Epoch ms, null while closed. */
  openedAt: number | null;
  lastFailureAt: number | null;
}

/** Consecutive failures before the circuit opens. */
const FAILURE_THRESHOLD = 3;

/** How long the circuit stays open before testing recovery. */
const COOLDOWN_MS = 60_000;

/**
 * Isolates persistent CDC failures by table so one source cannot block the pipeline.
 * Open circuits acknowledge and log skipped events until cooldown; half-open tests one event
 * before closing or reopening.
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

  /** @returns false while the circuit is open and still in cooldown. */
  shouldProcess(tableName: string): boolean {
    const entry = this.getOrCreate(tableName);

    if (entry.state === 'closed') return true;
    if (entry.state === 'half_open') return true;

    // State is 'open': has cooldown elapsed?
    const now = Date.now();
    if (entry.openedAt && now - entry.openedAt >= COOLDOWN_MS) {
      entry.state = 'half_open';
      log.warn(`Circuit HALF_OPEN for table '${tableName}': testing recovery`, {
        skippedCount: entry.skippedCount,
        openDurationMs: now - entry.openedAt,
      });
      return true;
    }

    entry.skippedCount++;
    return false;
  }

  /** Opens the circuit once consecutive failures reach FAILURE_THRESHOLD. */
  recordFailure(tableName: string): void {
    const entry = this.getOrCreate(tableName);
    entry.failureCount++;
    entry.lastFailureAt = Date.now();

    if (entry.state === 'half_open') {
      // Recovery test failed.
      entry.state = 'open';
      entry.openedAt = Date.now();
      log.warn(`Circuit re-OPENED for table '${tableName}': recovery test failed`, {
        failureCount: entry.failureCount,
        skippedCount: entry.skippedCount,
      });
      return;
    }

    if (entry.failureCount >= FAILURE_THRESHOLD && entry.state === 'closed') {
      entry.state = 'open';
      entry.openedAt = Date.now();
      entry.skippedCount = 0;
      log.warn(`Circuit OPEN for table '${tableName}': ${FAILURE_THRESHOLD} consecutive failures`, {
        failureCount: entry.failureCount,
      });
    }
  }

  /** Closes the circuit and clears its counters. */
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
      log.info(`Circuit CLOSED for table '${tableName}': recovered`, {
        skippedCount: skipped,
      });
    }
  }

  /** Health reporting: only circuits that are open or have failures. */
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
