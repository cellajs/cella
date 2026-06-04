import { type IntervalHistogram, monitorEventLoopDelay } from 'node:perf_hooks';

/**
 * Event-loop delay monitor.
 *
 * Lazily starts a single libuv-backed histogram (`monitorEventLoopDelay`) the
 * first time it is read and keeps it running for the lifetime of the process.
 * The mean delay is a cheap, allocation-free signal of how saturated the event
 * loop is — a healthy Node service idles near 0ms, a saturated one climbs into
 * the hundreds. Surfaced via `/health` so each service can grade its own
 * runtime responsiveness.
 */
let histogram: IntervalHistogram | null = null;

function ensureStarted(): IntervalHistogram {
  if (!histogram) {
    histogram = monitorEventLoopDelay({ resolution: 20 });
    histogram.enable();
  }
  return histogram;
}

/** Mean event-loop delay over the sampling window, in milliseconds (1 decimal). */
export function getEventLoopLagMs(): number {
  const meanNs = ensureStarted().mean;
  if (!Number.isFinite(meanNs)) return 0;
  return Math.round((meanNs / 1e6) * 10) / 10;
}
