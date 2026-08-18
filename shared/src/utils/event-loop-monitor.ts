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
 * Mean delay over the sampling window in milliseconds, reported by `/health`. The first read
 * starts a libuv histogram that then runs for the life of the process. A healthy service idles
 * near 0ms; a saturated one climbs into the hundreds.
 */
export function getEventLoopLagMs(): number {
  const meanNs = ensureStarted().mean;
  if (!Number.isFinite(meanNs)) return 0;
  return Math.round((meanNs / 1e6) * 10) / 10;
}
