import { type ELDHistogram, monitorEventLoopDelay } from 'node:perf_hooks';

/** How long one sampling window lasts. A burst leaves the reading within two windows. */
export const EVENT_LOOP_WINDOW_MS = 30_000;

/** The timer the histogram samples with. An idle loop fires it on time, so this much of every sample is no delay. */
const RESOLUTION_MS = 20;

let histogram: ELDHistogram | null = null;

/** The mean of the last window that ended, in nanoseconds. Null until the first one has. */
let lastWindowMeanNs: number | null = null;

function ensureStarted(): ELDHistogram {
  if (histogram) return histogram;
  const started = monitorEventLoopDelay({ resolution: RESOLUTION_MS });
  started.enable();
  // Each window starts empty, so a reading says how the loop does now and never how it did an hour ago.
  setInterval(() => {
    lastWindowMeanNs = started.mean;
    started.reset();
  }, EVENT_LOOP_WINDOW_MS).unref();
  histogram = started;
  return started;
}

/** A mean of the histogram as delay in milliseconds: the time between two samples, less the timer's own interval. */
const toDelayMs = (meanNs: number | null): number => {
  if (meanNs === null || !Number.isFinite(meanNs)) return 0;
  return Math.max(0, Math.round((meanNs / 1e6 - RESOLUTION_MS) * 10) / 10);
};

/**
 * Mean event-loop delay in milliseconds, reported by `/health`: the worse of the window that ended last and the one
 * that runs now, so a loop that blocks shows at once and one that recovered reads healthy again within a minute. The
 * first read starts a libuv histogram that then runs for the life of the process. A healthy service idles near 0ms; a
 * saturated one climbs into the hundreds.
 */
export function getEventLoopLagMs(): number {
  const running = ensureStarted().mean;
  return Math.max(toDelayMs(lastWindowMeanNs), toDelayMs(running));
}
