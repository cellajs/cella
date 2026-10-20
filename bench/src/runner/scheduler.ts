import { performance } from 'node:perf_hooks';
import type { Phase } from './types';

export type ScheduleEvent = { kind: 'phase'; at: number; phase: number } | { kind: 'arrival'; at: number; phase: number };

/** Seconds into a phase of its `i`-th arrival when the rate ramps linearly from `from` to `to` over `duration`. */
function rampedAt(i: number, from: number, to: number, duration: number): number {
  const slope = (to - from) / (2 * duration);
  if (slope === 0) return i / from;
  return (-from + Math.sqrt(from * from + 4 * slope * i)) / (2 * slope);
}

/** How many VUs a phase starts. */
export function phaseArrivals(phase: Phase): number {
  if (phase.arrivalCount !== undefined) return phase.arrivalCount;
  const rate = phase.arrivalRate ?? 0;
  return Math.round(((rate + (phase.rampTo ?? rate)) / 2) * phase.duration);
}

/**
 * Every phase start and VU arrival in order, in milliseconds from the run's start. Arrivals are uniform: a fixed rate
 * spaces them `1/rate` apart from the phase start, `arrivalCount` spreads them evenly over the duration, `rampTo`
 * follows the linear rate.
 */
export function* schedule(phases: Phase[]): Generator<ScheduleEvent> {
  let offset = 0;
  for (const [index, phase] of phases.entries()) {
    yield { kind: 'phase', at: offset, phase: index };
    const count = phaseArrivals(phase);
    const rate = phase.arrivalRate ?? 0;
    for (let i = 0; i < count; i++) {
      let seconds: number;
      if (phase.arrivalCount !== undefined) seconds = (i * phase.duration) / count;
      else if (phase.rampTo !== undefined && phase.rampTo !== rate) seconds = rampedAt(i, rate, phase.rampTo, phase.duration);
      else seconds = i / rate;
      yield { kind: 'arrival', at: offset + Math.min(seconds, phase.duration) * 1000, phase: index };
    }
    offset += phase.duration * 1000;
  }
}

/** Picks roles in proportion to their weights, interleaved and exact over every full cycle (smooth weighted round-robin). */
export function roleSequencer<T extends { weight: number }>(roles: T[]): () => T {
  const total = roles.reduce((sum, role) => sum + role.weight, 0);
  const current = roles.map(() => 0);
  return () => {
    let best = 0;
    for (let i = 0; i < roles.length; i++) {
      current[i] += roles[i].weight;
      if (current[i] > current[best]) best = i;
    }
    current[best] -= total;
    return roles[best];
  };
}

/**
 * Plays a schedule against the clock: each event fires at its time from `performance.now()` at the start, late ones
 * at once, so timer drift never accumulates. It never waits on the VUs it starts. Resolves after the last event, or
 * when `signal` aborts.
 */
export function play(events: Iterable<ScheduleEvent>, onEvent: (event: ScheduleEvent) => void, signal: AbortSignal): Promise<void> {
  const iterator = events[Symbol.iterator]();
  const start = performance.now();
  let next = iterator.next();
  return new Promise((resolve) => {
    let timer: NodeJS.Timeout | undefined;
    const stop = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener('abort', stop, { once: true });
    const tick = () => {
      const now = performance.now() - start;
      while (!next.done && next.value.at <= now && !signal.aborted) {
        onEvent(next.value);
        next = iterator.next();
      }
      if (next.done || signal.aborted) {
        signal.removeEventListener('abort', stop);
        return resolve();
      }
      timer = setTimeout(tick, Math.max(0, next.value.at - (performance.now() - start)));
    };
    tick();
  });
}
