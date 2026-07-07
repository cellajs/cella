import { type IntervalHistogram, monitorEventLoopDelay } from 'node:perf_hooks';

let histogram: IntervalHistogram | null = null;

function ensureStarted(): IntervalHistogram {
  if (!histogram) {
    histogram = monitorEventLoopDelay({ resolution: 20 });
    histogram.enable();
  }
  return histogram;
}

/**
 * Mean event-loop delay over the sampling window, in milliseconds (1 decimal).
 * Lazily starts a libuv-backed histogram on first read, kept running for the
 * life of the process: a healthy service idles near 0ms, a saturated one
 * climbs into the hundreds. Surfaced via `/health`.
 */
export function getEventLoopLagMs(): number {
  const meanNs = ensureStarted().mean;
  if (!Number.isFinite(meanNs)) return 0;
  return Math.round((meanNs / 1e6) * 10) / 10;
}
