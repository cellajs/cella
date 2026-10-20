import { describe, expect, it } from 'vitest';
import { phaseArrivals, play, roleSequencer, type ScheduleEvent, schedule } from '../runner/scheduler';

const arrivals = (events: Iterable<ScheduleEvent>) => [...events].filter((event) => event.kind === 'arrival').map((event) => event.at);

describe('schedule', () => {
  it('starts duration × rate VUs per phase, 1/rate apart from each phase start', () => {
    const times = arrivals(
      schedule([
        { name: 'a', duration: 2, arrivalRate: 4 },
        { name: 'b', duration: 1, arrivalRate: 2 },
      ]),
    );
    expect(times).toEqual([0, 250, 500, 750, 1000, 1250, 1500, 1750, 2000, 2500]);
  });

  it('spreads an arrival count over the duration', () => {
    expect(arrivals(schedule([{ name: 'one', duration: 1, arrivalCount: 1 }]))).toEqual([0]);
    expect(arrivals(schedule([{ name: 'four', duration: 2, arrivalCount: 4 }]))).toEqual([0, 500, 1000, 1500]);
  });

  it('follows a linear ramp: the average rate times the duration, denser at the end', () => {
    const phase = { name: 'ramp', duration: 10, arrivalRate: 0, rampTo: 10 };
    const times = arrivals(schedule([phase]));
    expect(times).toHaveLength(phaseArrivals(phase));
    expect(times).toHaveLength(50);
    const firstHalf = times.filter((at) => at < 5000).length;
    expect(firstHalf).toBeLessThan(times.length / 2);
    expect(Math.max(...times)).toBeLessThanOrEqual(10_000);
  });

  it('marks each phase start, a pause included', () => {
    const phases = [
      ...schedule([
        { name: 'a', duration: 1, arrivalRate: 1 },
        { name: 'pause', duration: 3, arrivalRate: 0 },
        { name: 'c', duration: 1, arrivalRate: 1 },
      ]),
    ]
      .filter((event) => event.kind === 'phase')
      .map((event) => [event.phase, event.at]);
    expect(phases).toEqual([
      [0, 0],
      [1, 1000],
      [2, 4000],
    ]);
  });
});

describe('roleSequencer', () => {
  it('picks roles exactly by weight over every cycle, interleaved', () => {
    const next = roleSequencer([
      { name: 'subscriber', weight: 9 },
      { name: 'writer', weight: 1 },
    ]);
    const picks = Array.from({ length: 30 }, () => next().name);
    expect(picks.filter((name) => name === 'writer')).toHaveLength(3);
    for (let cycle = 0; cycle < 3; cycle++) expect(picks.slice(cycle * 10, cycle * 10 + 10).filter((name) => name === 'writer')).toHaveLength(1);
  });
});

describe('play', () => {
  it('fires events at their time from the start without drifting', async () => {
    const started = performance.now();
    const fired: number[] = [];
    const events = Array.from({ length: 20 }, (_, i): ScheduleEvent => ({ kind: 'arrival', at: i * 10, phase: 0 }));
    await play(events, () => fired.push(performance.now() - started), new AbortController().signal);
    expect(fired).toHaveLength(20);
    // Each event fires at or after its time, and the last one close to it: lateness does not add up over 20 timers.
    for (const [i, at] of fired.entries()) expect(at).toBeGreaterThanOrEqual(i * 10 - 1);
    expect((fired.at(-1) as number) - 190).toBeLessThan(40);
  });

  it('stops when the signal aborts', async () => {
    const stop = new AbortController();
    let count = 0;
    const events = Array.from({ length: 100 }, (_, i): ScheduleEvent => ({ kind: 'arrival', at: i * 10, phase: 0 }));
    setTimeout(() => stop.abort(), 55);
    await play(events, () => count++, stop.signal);
    expect(count).toBeGreaterThan(3);
    expect(count).toBeLessThan(15);
  });
});
