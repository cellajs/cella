import { sql } from "drizzle-orm";
import { cdcDb } from "../lib/db";
import { CDC_SLOT_NAME, RESOURCE_LIMITS } from "../constants";
import { wsClient } from "../network/websocket-client";
import { logEvent } from "../lib/pino";

const BUCKET_MS = 10_000; // 10s per bucket
const BUCKET_COUNT = 6; // 6 buckets = 60s rolling window
const LAG_POLL_MS = 10_000;

const { warnBytes, unhealthyBytes } = RESOURCE_LIMITS.walLag;

interface Bucket {
  startMs: number;
  eventCount: number;
  flushCount: number;
  processingDurations: number[];
  flushDurations: number[];
  batchSizes: number[];
}

function createBucket(startMs: number): Bucket {
  return {
    startMs,
    eventCount: 0,
    flushCount: 0,
    processingDurations: [],
    flushDurations: [],
    batchSizes: [],
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

class CdcMetrics {
  private buckets: Bucket[] = [];
  private walLagBytes: number | null = null;
  private walSlotActive: boolean | null = null;
  private walSlotStatus: string | null = null;
  private lagInterval: ReturnType<typeof setInterval> | null = null;
  private prevLagBytes: number | null = null;
  private hasWarned = false;
  private hasGoneUnhealthy = false;

  /** WAL bytes behind the slot's confirmed flush LSN (null until first poll). */
  get lagBytes(): number | null {
    return this.walLagBytes;
  }

  /** Whether PostgreSQL reports the replication slot as active (null until first poll). */
  get slotActive(): boolean | null {
    return this.walSlotActive;
  }

  /** The replication slot's wal_status from pg_replication_slots (null until first poll).
   * Values: 'active', 'reserved', or 'lost' (see PostgreSQL docs).
   */
  get slotStatus(): string | null {
    return this.walSlotStatus;
  }

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
        avg: sortedProc.length
          ? Math.round(
              (sortedProc.reduce((a, b) => a + b, 0) / sortedProc.length) * 10,
            ) / 10
          : 0,
        p50: Math.round(percentile(sortedProc, 50) * 10) / 10,
        p95: Math.round(percentile(sortedProc, 95) * 10) / 10,
        p99: Math.round(percentile(sortedProc, 99) * 10) / 10,
      },
      batchSize: {
        avg: sortedBatch.length
          ? Math.round(
              (sortedBatch.reduce((a, b) => a + b, 0) / sortedBatch.length) *
                10,
            ) / 10
          : 0,
        max: sortedBatch.length ? sortedBatch[sortedBatch.length - 1] : 0,
      },
      flushes: totalFlushes,
      walLagBytes: this.walLagBytes,
      slotStatus: this.walSlotStatus,
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

  private checkLagThresholds(currentBytes: number): void {
    const prev = this.prevLagBytes;
    this.prevLagBytes = currentBytes;

    // If lag dropped below warn threshold, reset warning state
    if (prev !== null && currentBytes < warnBytes) {
      this.hasWarned = false;
      this.hasGoneUnhealthy = false;
      return;
    }

    // Warn threshold crossed
    if (currentBytes >= warnBytes && !this.hasWarned) {
      this.hasWarned = true;
      logEvent("warn", "WAL lag approaching backpressure limit", {
        lagBytes: currentBytes,
        warnThreshold: warnBytes,
        unhealthyThreshold: unhealthyBytes,
      });
      this.emitLagControl("wal_lag_warn");
    }

    // Unhealthy threshold crossed
    if (currentBytes >= unhealthyBytes && !this.hasGoneUnhealthy) {
      this.hasGoneUnhealthy = true;
      logEvent("error", "WAL lag exceeded backpressure limit — CDC unhealthy", {
        lagBytes: currentBytes,
        unhealthyThreshold: unhealthyBytes,
      });
      this.emitLagControl("wal_lag_unhealthy");
    }
  }

  private emitLagControl(severity: "wal_lag_warn" | "wal_lag_unhealthy"): void {
    const payload = {
      _control: "wal_lag_alert",
      severity,
      lagBytes: this.walLagBytes,
      warnThreshold: warnBytes,
      unhealthyThreshold: unhealthyBytes,
      slotStatus: this.walSlotStatus,
    };
    if (!wsClient.send(payload)) {
      logEvent("warn", "Failed to send WAL lag control message to backend");
    }
  }

  private async pollLag(): Promise<void> {
    try {
      const result = await cdcDb.execute<{
        lag_bytes: string;
        active: boolean;
        wal_status: string;
      }>(
        sql`SELECT active, wal_status, pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)::text AS lag_bytes
            FROM pg_replication_slots
            WHERE slot_name = ${CDC_SLOT_NAME}`,
      );
      const row = result.rows[0];
      if (row) {
        this.walLagBytes = Number(row.lag_bytes);
        this.walSlotActive = row.active;
        this.walSlotStatus = row.wal_status;
        this.checkLagThresholds(this.walLagBytes);
      } else {
        this.walSlotActive = false;
        this.walSlotStatus = null;
        this.prevLagBytes = null;
        this.hasWarned = false;
        this.hasGoneUnhealthy = false;
      }
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
  slotStatus: string | null;
}

export const cdcMetrics = new CdcMetrics();
