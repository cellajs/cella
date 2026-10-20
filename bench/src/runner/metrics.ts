import { createHistogram, type RecordableHistogram } from 'node:perf_hooks';

/** Percentiles of a histogram in milliseconds; zeros when it recorded nothing. */
export interface Distribution {
  count: number;
  min: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

/** Histograms hold integers: values are recorded in microseconds, so sub-millisecond latencies keep their precision. */
const toMicros = (ms: number) => Math.max(1, Math.round(ms * 1000));

function distribution(histogram: RecordableHistogram): Distribution {
  if (histogram.count === 0) return { count: 0, min: 0, mean: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const ms = (micros: number) => micros / 1000;
  return {
    count: histogram.count,
    min: ms(histogram.min),
    mean: ms(histogram.mean),
    p50: ms(histogram.percentile(50)),
    p95: ms(histogram.percentile(95)),
    p99: ms(histogram.percentile(99)),
    max: ms(histogram.max),
  };
}

interface Pair {
  total: RecordableHistogram;
  interval: RecordableHistogram;
}

/** One endpoint's requests: time to first byte and to the last byte, status codes, timeouts and transport errors. */
export interface EndpointStats {
  requests: number;
  ttfb: RecordableHistogram;
  total: RecordableHistogram;
  codes: Map<number, number>;
  timeouts: number;
  errors: number;
}

export interface EndpointSummary {
  requests: number;
  ttfb: Distribution;
  total: Distribution;
  codes: Record<string, number>;
  nonOk: number;
  timeouts: number;
  errors: number;
}

export interface IntervalSnapshot {
  counters: Record<string, number>;
  histograms: Record<string, Distribution>;
}

/** Counters and histograms by name, each kept twice: for the whole run, and for the current interval until `tick`. */
export class Metrics {
  readonly counters = new Map<string, number>();
  private readonly intervalCounters = new Map<string, number>();
  private readonly histograms = new Map<string, Pair>();
  readonly endpoints = new Map<string, EndpointStats>();

  counter(name: string, n = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + n);
    this.intervalCounters.set(name, (this.intervalCounters.get(name) ?? 0) + n);
  }

  histogram(name: string, ms: number): void {
    let pair = this.histograms.get(name);
    if (!pair) {
      pair = { total: createHistogram(), interval: createHistogram() };
      this.histograms.set(name, pair);
    }
    const value = toMicros(ms);
    pair.total.record(value);
    pair.interval.record(value);
  }

  endpoint(label: string): EndpointStats {
    let stats = this.endpoints.get(label);
    if (!stats) {
      stats = { requests: 0, ttfb: createHistogram(), total: createHistogram(), codes: new Map(), timeouts: 0, errors: 0 };
      this.endpoints.set(label, stats);
    }
    return stats;
  }

  /** Records a response: `http.codes.<status>`, `http.response_time` (first byte) and, when the body was read, `http.total_time`. */
  response(label: string, status: number, ttfbMs: number, totalMs?: number): void {
    const stats = this.endpoint(label);
    stats.codes.set(status, (stats.codes.get(status) ?? 0) + 1);
    stats.ttfb.record(toMicros(ttfbMs));
    this.counter('http.responses');
    this.counter(`http.codes.${status}`);
    this.histogram('http.response_time', ttfbMs);
    if (totalMs !== undefined) {
      stats.total.record(toMicros(totalMs));
      this.histogram('http.total_time', totalMs);
    }
  }

  get(name: string): number {
    return this.counters.get(name) ?? 0;
  }

  /** Whole-run distribution of a histogram; undefined for a name nothing recorded. */
  distribution(name: string): Distribution | undefined {
    const pair = this.histograms.get(name);
    return pair && distribution(pair.total);
  }

  histogramNames(): string[] {
    return [...this.histograms.keys()];
  }

  /** The interval's counters and histograms, then a fresh interval. */
  tick(): IntervalSnapshot {
    const counters = Object.fromEntries(this.intervalCounters);
    this.intervalCounters.clear();
    const histograms: Record<string, Distribution> = {};
    for (const [name, pair] of this.histograms) {
      if (pair.interval.count > 0) histograms[name] = distribution(pair.interval);
      pair.interval.reset();
    }
    return { counters, histograms };
  }

  endpointSummaries(): Record<string, EndpointSummary> {
    const result: Record<string, EndpointSummary> = {};
    for (const [label, stats] of this.endpoints) {
      const codes = Object.fromEntries([...stats.codes].sort(([a], [b]) => a - b).map(([code, n]) => [String(code), n]));
      const nonOk = [...stats.codes].filter(([code]) => code < 200 || code > 299).reduce((sum, [, n]) => sum + n, 0);
      result[label] = {
        requests: stats.requests,
        ttfb: distribution(stats.ttfb),
        total: distribution(stats.total),
        codes,
        nonOk,
        timeouts: stats.timeouts,
        errors: stats.errors,
      };
    }
    return result;
  }
}
