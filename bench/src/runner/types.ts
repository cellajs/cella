import type { IncomingHttpHeaders } from 'node:http';

/** A stretch of load: `arrivalRate` new VUs per second (ramping to `rampTo`), or `arrivalCount` VUs spread over `duration` seconds. */
export interface Phase {
  name: string;
  duration: number;
  arrivalRate?: number;
  rampTo?: number;
  arrivalCount?: number;
}

export type Stat = 'p50' | 'p95' | 'p99' | 'max' | 'min' | 'mean';
export type BuiltinHistogram = 'http.response_time' | 'http.total_time';
/** A histogram statistic by name, such as `http.response_time.p95`. */
export type MetricKey<H extends string> = `${BuiltinHistogram | H}.${Stat}`;

/** What a run must meet. Percentages are 0-100; latencies are milliseconds. */
export interface Checks<C extends string, H extends string> {
  thresholds?: Partial<Record<MetricKey<H>, number>>;
  /** Highest share of VUs that may fail: created minus completed, over created. */
  maxErrorRate?: number;
  /** Highest share of responses that may be other than 2xx; 1 when unset. */
  maxRejectedShare?: number;
  /** Counters that must have counted (full runs only: a short run plays each role once). */
  expect?: readonly C[];
  /** Counters that must stay at zero. */
  forbid?: readonly C[];
}

export interface HttpRequestOptions {
  json?: unknown;
  body?: string | Uint8Array;
  headers?: Record<string, string>;
  /** Endpoint label for the per-endpoint table; method and path without the query when unset. */
  name?: string;
  /** Milliseconds; 10 s when unset. */
  timeout?: number;
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  headers: IncomingHttpHeaders;
  body: Buffer;
  text(): string;
  json<T = unknown>(): T;
}

/** Requests over one keep-alive connection per VU. Resolves for every status; rejects on a transport error or timeout. */
export interface HttpClient {
  request(method: string, url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
  get(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
  post(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
  put(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
  patch(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
  delete(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
}

export interface SseEvent {
  event: string;
  data: string;
  id?: string;
}

export interface SseOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  name?: string;
}

/** What one virtual user gets. A throw marks it failed and counts `errors.<code>`. */
export interface Vu<C extends string = string, H extends string = string> {
  /** Arrival number from 0, unique in the run. */
  index: number;
  role: string | null;
  short: boolean;
  /** Aborts when the run stops before this VU is done. */
  signal: AbortSignal;
  http: HttpClient;
  /** Reads an event stream until it ends or `signal` aborts; resolves to the response status. */
  sse(url: string, onEvent: (event: SseEvent) => void, options?: SseOptions): Promise<number>;
  /** An open WebSocket, closed when the VU ends. */
  ws(url: string, protocols?: string | string[]): Promise<WebSocket>;
  think(ms: number): Promise<void>;
  counter(name: C, n?: number): void;
  histogram(name: H, value: number): void;
  /** Prints a line without breaking the live display. */
  log(text: string): void;
  /** Adds data to the run's log under `name`. */
  attach(name: string, data: unknown): void;
}

export type VuFn<C extends string, H extends string> = (vu: Vu<C, H>) => Promise<void>;

export interface Role<C extends string, H extends string> {
  name: string;
  weight: number;
  vu: VuFn<C, H>;
}

interface ScenarioBase<C extends string, H extends string> {
  description: string;
  /** Every counter the scenario counts: `vu.counter`, `expect` and `forbid` accept these names only. */
  counters?: readonly C[];
  /** Every histogram the scenario records, in milliseconds. */
  histograms?: readonly H[];
  checks?: Checks<NoInfer<C>, NoInfer<H>>;
  /** The latency a baseline compares first; `http.response_time.p95` when unset. */
  primary?: MetricKey<NoInfer<H>>;
  /** Seconds the run waits for VUs in flight after the last arrival before it aborts them; 120 when unset. */
  drainTimeout?: number;
}

/** A load scenario (`phases` with `vu` or weighted `roles`), or a single-run one (`run`, called once). */
export type Scenario<C extends string = string, H extends string = string> = ScenarioBase<C, H> &
  (
    | { phases: Phase[]; vu: VuFn<NoInfer<C>, NoInfer<H>>; roles?: never; run?: never }
    | { phases: Phase[]; roles: Role<NoInfer<C>, NoInfer<H>>[]; vu?: never; run?: never }
    | { run: VuFn<NoInfer<C>, NoInfer<H>>; phases?: never; vu?: never; roles?: never }
  );

export interface CheckResult {
  id: string;
  ok: boolean;
  text: string;
}
