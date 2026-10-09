import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The histogram as libuv fills it: `mean` is the time between two samples, in nanoseconds. */
const histogram = { mean: Number.NaN, enable: vi.fn(), reset: vi.fn() };

vi.mock('node:perf_hooks', () => ({ monitorEventLoopDelay: () => histogram }));

const ms = (value: number) => value * 1e6;

/** A loop that fires its 20 ms timer on time. */
const IDLE = ms(20.9);

describe('getEventLoopLagMs', () => {
  let getEventLoopLagMs: () => number;
  let windowMs: number;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    histogram.mean = Number.NaN;
    histogram.reset.mockClear();
    const monitor = await import('./event-loop-monitor');
    getEventLoopLagMs = monitor.getEventLoopLagMs;
    windowMs = monitor.EVENT_LOOP_WINDOW_MS;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads 0 before the first sample', () => {
    expect(getEventLoopLagMs()).toBe(0);
  });

  it("reads near 0 on an idle loop: the timer's own interval is no delay", () => {
    getEventLoopLagMs();
    histogram.mean = IDLE;

    expect(getEventLoopLagMs()).toBe(0.9);
  });

  it('shows a loop that blocks at once, inside the window that runs', () => {
    getEventLoopLagMs();
    histogram.mean = ms(520);

    expect(getEventLoopLagMs()).toBe(500);
  });

  it('must not keep a burst in the reading: two windows later the loop reads healthy again', () => {
    getEventLoopLagMs();
    histogram.mean = ms(520);

    // The window with the burst ends. The loop is idle from here on.
    vi.advanceTimersByTime(windowMs);
    expect(histogram.reset).toHaveBeenCalledTimes(1);
    histogram.mean = IDLE;
    expect(getEventLoopLagMs()).toBe(500);

    vi.advanceTimersByTime(windowMs);
    expect(getEventLoopLagMs()).toBe(0.9);
  });

  it('starts every window empty', () => {
    getEventLoopLagMs();

    vi.advanceTimersByTime(windowMs * 3);

    expect(histogram.reset).toHaveBeenCalledTimes(3);
  });
});
