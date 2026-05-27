import { sql } from 'drizzle-orm';
import { cdcDb } from '../lib/db';
import { CDC_SLOT_NAME } from '../constants';


const BUCKET_MS = 10_000; // 10s per bucket
const BUCKET_COUNT = 6; // 6 buckets = 60s rolling window
const LAG_POLL_MS = 10_000;

interface Bucket {
  startMs: number;
  eventCount: number;
  flushCount: number;
  processingDurations: number[];
  flushDurations: number[];
  batchSizes: number[];
}

function createBucket(startMs: number): Bucket {
  return { startMs, eventCount: 0, flushCount: 0, processingDurations: [], flushDurations: [], batchSizes: [] };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

class CdcMetrics {
  private buckets: Bucket[] = [];
  private walLagBytes: number | null = null;
  private lagInterval: ReturnType<typeof setInterval> | null = null;

  private currentBucket(): Bucket {
    const now = Date.now();
    const last = this.buckets[this.buckets.length - 1];
    if (last && now - last.startMs < BUCKET_MS) return last;

    const bucket = createBucket(now);
    this.buckets.push(bucket);
    // Evict old buckets
    while (this.buckets.length > BUCKET_COUNT) this.buckets.shift();
    return bucket;
  }

  /** Record a processEvents() call (one group within a flush). */
  recordProcessing(eventCount: number, durationMs: number): void {
    const b = this.currentBucket();
    b.eventCount += eventCount;
    b.processingDurations.push(durationMs);
    b.batchSizes.push(eventCount);
  }

  /** Record a full FlushBuffer flush cycle. */
  recordFlush(_eventCount: number, durationMs: number): void {
    const b = this.currentBucket();
    b.flushCount++;
    b.flushDurations.push(durationMs);
    // eventCount tracked via recordProcessing per group
  }

  /** Snapshot for health endpoint. */
  getSnapshot(): MetricsSnapshot {
    const allProcessing: number[] = [];
    const allBatchSizes: number[] = [];
    let totalEvents = 0;
    let totalFlushes = 0;
    let windowMs = 0;

    const cutoff = Date.now() - BUCKET_COUNT * BUCKET_MS;
    for (const b of this.buckets) {
      if (b.startMs < cutoff) continue;
      totalEvents += b.eventCount;
      totalFlushes += b.flushCount;
      allProcessing.push(...b.processingDurations);
      allBatchSizes.push(...b.batchSizes);
      windowMs = Math.max(windowMs, Date.now() - b.startMs);
    }

    const sortedProc = allProcessing.slice().sort((a, b) => a - b);
    const sortedBatch = allBatchSizes.slice().sort((a, b) => a - b);
    const windowSec = Math.max(1, windowMs / 1000);

    return {
      windowSeconds: Math.round(windowSec),
      eventsProcessed: totalEvents,
      throughput: Math.round((totalEvents / windowSec) * 10) / 10,
      processingLatency: {
        avg: sortedProc.length ? Math.round((sortedProc.reduce((a, b) => a + b, 0) / sortedProc.length) * 10) / 10 : 0,
        p50: Math.round(percentile(sortedProc, 50) * 10) / 10,
        p95: Math.round(percentile(sortedProc, 95) * 10) / 10,
        p99: Math.round(percentile(sortedProc, 99) * 10) / 10,
      },
      batchSize: {
        avg: sortedBatch.length ? Math.round((sortedBatch.reduce((a, b) => a + b, 0) / sortedBatch.length) * 10) / 10 : 0,
        max: sortedBatch.length ? sortedBatch[sortedBatch.length - 1] : 0,
      },
      flushes: totalFlushes,
      walLagBytes: this.walLagBytes,
    };
  }

  /** Start periodic WAL lag polling. */
  startLagPolling(): void {
    if (this.lagInterval) return;
    this.pollLag(); // initial
    this.lagInterval = setInterval(() => this.pollLag(), LAG_POLL_MS);
  }

  /** Stop all background tasks. */
  stop(): void {
    if (this.lagInterval) clearInterval(this.lagInterval);
    this.lagInterval = null;
  }

  private async pollLag(): Promise<void> {
    try {
      const result = await cdcDb.execute<{ lag_bytes: string }>(
        sql`SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)::text AS lag_bytes
            FROM pg_replication_slots
            WHERE slot_name = ${CDC_SLOT_NAME}`,
      );
      const row = result.rows[0];
      if (row) this.walLagBytes = Number(row.lag_bytes);
    } catch {
      // Non-critical — skip silently
    }
  }
}

export interface MetricsSnapshot {
  windowSeconds: number;
  eventsProcessed: number;
  throughput: number;
  processingLatency: { avg: number; p50: number; p95: number; p99: number };
  batchSize: { avg: number; max: number };
  flushes: number;
  walLagBytes: number | null;
}

export const cdcMetrics = new CdcMetrics();
