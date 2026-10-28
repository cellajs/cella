import { sql } from 'drizzle-orm';
import { cdcSlotName, resourceLimits } from '../constants';
import { cdcDb } from '../lib/db';
import { log } from '../lib/pino';

const bucketMs = 10_000;
/** Buckets in the rolling window: a minute. */
const bucketCount = 6;
const lagPollMs = 10_000;

const { walLagWarnBytes, walLagUnhealthyBytes } = resourceLimits.health;

interface Bucket {
  startMs: number;
  eventCount: number;
  processingDurations: number[];
  batchSizes: number[];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

class Metrics {
  /** WAL bytes behind the slot's acknowledged position (null until first poll). */
  lagBytes: number | null = null;
  /** Whether PostgreSQL reports the replication slot as active (null until first poll). */
  slotActive: boolean | null = null;
  /** pg_replication_slots.wal_status: 'reserved', 'extended', 'unreserved' or 'lost'; null until the first poll. */
  slotStatus: string | null = null;
  private buckets: Bucket[] = [];
  private lagInterval: ReturnType<typeof setInterval> | null = null;
  private hasWarned = false;
  private hasGoneUnhealthy = false;

  private currentBucket(): Bucket {
    const now = Date.now();
    const last = this.buckets[this.buckets.length - 1];
    if (last && now - last.startMs < bucketMs) return last;

    const bucket: Bucket = { startMs: now, eventCount: 0, processingDurations: [], batchSizes: [] };
    this.buckets.push(bucket);
    while (this.buckets.length > bucketCount) this.buckets.shift();
    return bucket;
  }

  /** Record one recorded and dispatched flush. */
  recordProcessing(eventCount: number, durationMs: number): void {
    const bucket = this.currentBucket();
    bucket.eventCount += eventCount;
    bucket.processingDurations.push(durationMs);
    bucket.batchSizes.push(eventCount);
  }

  /** Snapshot for health endpoint. */
  getSnapshot(): MetricsSnapshot {
    const allProcessing: number[] = [];
    const allBatchSizes: number[] = [];
    let totalEvents = 0;
    let windowMs = 0;

    const cutoff = Date.now() - bucketCount * bucketMs;
    for (const bucket of this.buckets) {
      if (bucket.startMs < cutoff) continue;
      totalEvents += bucket.eventCount;
      allProcessing.push(...bucket.processingDurations);
      allBatchSizes.push(...bucket.batchSizes);
      windowMs = Math.max(windowMs, Date.now() - bucket.startMs);
    }

    const sortedProc = allProcessing.slice().sort((a, b) => a - b);
    const sortedBatch = allBatchSizes.slice().sort((a, b) => a - b);
    const windowSec = Math.max(1, windowMs / 1000);

    const avgBatchSize = sortedBatch.length ? Math.round((sortedBatch.reduce((sum, size) => sum + size, 0) / sortedBatch.length) * 10) / 10 : 0;

    return {
      windowSeconds: Math.round(windowSec),
      eventsProcessed: totalEvents,
      throughput: Math.round((totalEvents / windowSec) * 10) / 10,
      processingLatency: {
        avg: sortedProc.length ? Math.round((sortedProc.reduce((sum, duration) => sum + duration, 0) / sortedProc.length) * 10) / 10 : 0,
        p50: Math.round(percentile(sortedProc, 50) * 10) / 10,
        p95: Math.round(percentile(sortedProc, 95) * 10) / 10,
        p99: Math.round(percentile(sortedProc, 99) * 10) / 10,
      },
      batchSize: {
        avg: avgBatchSize,
        max: sortedBatch.length ? sortedBatch[sortedBatch.length - 1] : 0,
      },
    };
  }

  /** Reads the slot now and every `lagPollMs` after, until `stop`. */
  startLagPolling(): void {
    if (this.lagInterval) return;
    void this.pollLag();
    this.lagInterval = setInterval(() => void this.pollLag(), lagPollMs);
    this.lagInterval.unref?.();
  }

  /** Stop all background tasks. */
  stop(): void {
    if (this.lagInterval) clearInterval(this.lagInterval);
    this.lagInterval = null;
  }

  /** One log line each time the lag passes a threshold. Health carries the lag itself, with every push. */
  private logLagThresholds(lagBytes: number): void {
    if (lagBytes < walLagWarnBytes) {
      this.hasWarned = false;
      this.hasGoneUnhealthy = false;
      return;
    }

    if (!this.hasWarned) {
      this.hasWarned = true;
      log.warn('Slot lag is high: the worker is far behind', { lagBytes, warnThreshold: walLagWarnBytes, unhealthyThreshold: walLagUnhealthyBytes });
    }

    if (lagBytes >= walLagUnhealthyBytes && !this.hasGoneUnhealthy) {
      this.hasGoneUnhealthy = true;
      log.error('Slot lag passed its limit: the worker reports unhealthy', { lagBytes, unhealthyThreshold: walLagUnhealthyBytes });
    }
  }

  /** Reads the slot's lag, whether it is read and its `wal_status`; a subscription that starts reads it at once too. */
  async pollLag(): Promise<void> {
    try {
      const result = await cdcDb.execute<{ lag_bytes: string; active: boolean; wal_status: string }>(
        sql`SELECT active, wal_status, pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)::text AS lag_bytes
            FROM pg_replication_slots
            WHERE slot_name = ${cdcSlotName}`,
      );
      const row = result.rows[0];
      if (row) {
        this.lagBytes = Number(row.lag_bytes);
        this.slotActive = row.active;
        this.slotStatus = row.wal_status;
        this.logLagThresholds(this.lagBytes);
      } else {
        this.lagBytes = null;
        this.slotActive = false;
        this.slotStatus = null;
        this.hasWarned = false;
        this.hasGoneUnhealthy = false;
      }
    } catch {
      // Not critical: the next poll reads it.
    }
  }
}

/** What the worker did in the last minute, for the health endpoint. The bench reads `throughput` and `processingLatency.p95`. */
export interface MetricsSnapshot {
  windowSeconds: number;
  eventsProcessed: number;
  throughput: number;
  processingLatency: { avg: number; p50: number; p95: number; p99: number };
  batchSize: { avg: number; max: number };
}

/** The worker's rolling minute of flushes, and the last poll of its slot: lag, whether it is read, its `wal_status`. */
export const metrics = new Metrics();
