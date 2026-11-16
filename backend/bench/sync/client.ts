import { performance } from 'node:perf_hooks';
import type { SseEvent, Vu } from '@cellajs/cli/bench';
import { hashSpread } from 'shared/utils/spread-hash';
import { uuidv7 } from 'uuidv7';
import type { StreamCatchupResponse, StreamChange, StreamErrorPayload, StreamSignal } from '#/schemas/stream-schemas';
import { ORG_PATH } from '../bench-user';
import { SYNC_RANGE_KEY } from '../config';
import { ORG_ID } from '../seeds/ids';
import type { BenchProduct } from './product';

/** The frontend's fallback spread window (`fetch-prioritizer.ts`) and its background tier's ceiling (`sync-priority.ts`). */
const defaultSpreadWindowMs = 15_000;
const spreadCeilingMs = 30_000;
/** Rows per range read: the frontend's `syncChunkSize`, also the list's page cap. */
const chunkSize = 1000;
/** A failed connect must not hang a scenario: a stream that sends no `offset` frame within this time counts as open. */
const openTimeoutMs = 10_000;

/** What a sync client counts and times; a scenario spreads these into its own `counters` and `histograms`. */
export const SYNC_COUNTERS = ['sse.changes', 'sync.range_fetches', 'sync.kept_answers', 'sync.read_limited', 'sse.errors'] as const;
export const SYNC_HISTOGRAMS = ['sync.fetch_ms', 'sync.reaction_delay_ms'] as const;
type SyncMetrics = Pick<Vu<(typeof SYNC_COUNTERS)[number], (typeof SYNC_HISTOGRAMS)[number]>, 'counter' | 'histogram'>;

/**
 * When an announced range is read: at once (a viewed channel), in the spread slot the frontend's scheduler takes (a
 * channel in the background, without its 2 s minimum so the spread itself is measured), or never (a client that only
 * listens).
 */
export type FetchMode = 'immediate' | 'spread' | 'off';

type Row = Record<string, unknown> & { id: string; seq?: number | null; deletedAt?: string | null };

export interface SyncClientOptions {
  /** A VU, or one of its extra clients: the requests and the stream go through it. */
  client: Pick<Vu, 'http' | 'sse'>;
  cookie: string;
  product: BenchProduct;
  mode: FetchMode;
  metrics: SyncMetrics;
  /** The organization the client tracks; the bench organization when unset. */
  organizationId?: string;
  organizationPath?: string;
  /** Stamps the client's own edits: a frame whose rows are all its own leads to no read. */
  sourceId?: string;
  onChange?(change: StreamChange, at: number): void;
  /** A row the client read, with its field, or null when the row is deleted. */
  onRead?(id: string, value: string | null, at: number): void;
  onSignal?(signal: StreamSignal, at: number): void;
  /** The server ends the stream: `access_changed`, `resync` and the other codes of `streamErrorSchema`. */
  onStreamError?(error: StreamErrorPayload, at: number): void;
}

/** What one catchup answered for the client's view. */
export interface CatchupResult {
  status: 'ok' | 'opaque' | 'forbidden' | 'failed';
  frontier: number | null;
  ms: number;
}

/** Polls `done` every `intervalMs`; resolves to the wait in ms, or null at the timeout. Control flow only: time an event where it happens. */
export async function waitFor(done: () => boolean | Promise<boolean>, timeoutMs: number, intervalMs = 50): Promise<number | null> {
  const started = performance.now();
  while (!(await done())) {
    if (performance.now() - started > timeoutMs) return null;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return performance.now() - started;
}

/**
 * One person's sync engine at the protocol level, as the frontend runs it: a stream of change frames, a catchup on every
 * connect, range reads from a cursor, and the rows it holds by id. It reads `(cursor, newest announced]` one read at a
 * time: the cursor never passes a range it has not read. It keeps no query cache: a scenario compares `rows` with the
 * database to prove it converged.
 */
export function createSyncClient(options: SyncClientOptions) {
  const { client, cookie, product, mode, metrics } = options;
  const organizationId = options.organizationId ?? ORG_ID;
  const listPath = product.listPath(options.organizationPath ?? ORG_PATH);
  const listName = `GET ${product.listPath('')}`;
  const sourceId = options.sourceId ?? uuidv7();
  const headers = { cookie };

  const rows = new Map<string, string>();
  let cursor: number | null = null;
  let announced = 0;
  let generation: number | null = null;
  let spreadWindow: number | null = null;
  /** The `rangeKey` of the newest frame, which a range read sends so readers of the same rows share one answer. */
  let rangeKey: string | undefined;
  let lastRangeUrl: string | undefined;
  let reading = false;
  let timer: NodeJS.Timeout | null = null;
  let stream: AbortController | null = null;
  let streamEnded: Promise<void> = Promise.resolve();

  const apply = (row: Row, at: number) => {
    if (row.deletedAt) rows.delete(row.id);
    else rows.set(row.id, String(row[product.field]));
    options.onRead?.(row.id, row.deletedAt ? null : String(row[product.field]), at);
  };

  /**
   * Reads the rows stamped in `(afterSeq, untilSeq]`, a chunk at a time, continuing after the newest row of a full chunk.
   * @returns true when read, false on a failure, or the milliseconds the server's read budget asks to wait.
   */
  async function readRange(afterSeq: number, untilSeq: number): Promise<boolean | number> {
    const started = performance.now();
    let from = afterSeq;
    try {
      while (from < untilSeq) {
        const url = `${listPath}?afterSeq=${from}&untilSeq=${untilSeq}&maxPageSize=${chunkSize}`;
        const res = await client.http.get(url, {
          headers: SYNC_RANGE_KEY && rangeKey ? { ...headers, 'x-range-key': rangeKey } : headers,
          name: `${listName} (range)`,
        });
        if (res.ok) lastRangeUrl = url;
        if (res.headers['x-range-answer'] === 'kept') metrics.counter('sync.kept_answers');
        // A spent read budget is backpressure, as for the frontend: wait the server's `Retry-After`, then read on.
        if (res.status === 429) {
          metrics.counter('sync.read_limited');
          return Number(res.headers['retry-after'] ?? 5) * 1000;
        }
        if (!res.ok) {
          metrics.counter('sse.errors');
          return false;
        }
        const { results } = res.json() as { results: Row[] };
        const at = performance.now();
        for (const row of results) apply(row, at);
        const newest = Math.max(from, ...results.map((row) => row.seq ?? from));
        if (results.length >= chunkSize && newest === from) {
          metrics.counter('sse.errors');
          return false;
        }
        from = results.length >= chunkSize ? newest : untilSeq;
      }
      metrics.counter('sync.range_fetches');
      metrics.histogram('sync.fetch_ms', performance.now() - started);
      return true;
    } catch {
      metrics.counter('sse.errors');
      return false;
    }
  }

  async function drain(): Promise<void> {
    timer = null;
    reading = true;
    while (cursor !== null && announced > cursor) {
      const until = announced;
      const read = await readRange(cursor, until);
      if (typeof read === 'number' && stream) timer = setTimeout(() => void drain(), read);
      if (read !== true) break;
      cursor = Math.max(cursor, until);
    }
    reading = false;
  }

  /** Queues a read up to `seq` by the fetch mode; a read already queued or running covers it. */
  function announce(seq: number, windowMs: number | null): void {
    announced = Math.max(announced, seq);
    if (mode === 'off' || cursor === null || announced <= cursor || reading || timer) return;
    const window = windowMs ?? defaultSpreadWindowMs;
    const delay =
      mode === 'immediate' || window <= 0 ? 0 : Math.min(hashSpread(`${sourceId}:${product.type}:${organizationId}`) % window, spreadCeilingMs);
    metrics.histogram('sync.reaction_delay_ms', delay);
    if (delay === 0) void drain();
    else timer = setTimeout(() => void drain(), delay);
  }

  function onChange(change: StreamChange, at: number): void {
    if (change.productType !== product.type || change.organizationId !== organizationId) return;
    options.onChange?.(change, at);
    rangeKey = change.rangeKey ?? rangeKey;
    for (const row of change.rows) if (row.seq === null && change.action === 'moveOut') rows.delete(row.subjectId);
    const seqs = change.rows.flatMap(({ seq }) => (seq === null ? [] : [seq]));
    if (change.overflow?.untilSeq != null) seqs.push(change.overflow.untilSeq);
    if (seqs.length === 0) return;
    metrics.counter('sse.changes');
    if (change.rows.length > 0 && change.rows.every((row) => row.stx?.sourceId === sourceId)) {
      announced = Math.max(announced, ...seqs);
      return;
    }
    announce(Math.max(...seqs), change.spreadWindow);
  }

  function onEvent({ event, data }: SseEvent, opened: () => void): void {
    const at = performance.now();
    try {
      if (event === 'offset' || event === 'ping') opened();
      else if (event === 'change') onChange(JSON.parse(data) as StreamChange, at);
      else if (event === 'signal') options.onSignal?.(JSON.parse(data) as StreamSignal, at);
      else if (event === 'error') options.onStreamError?.(JSON.parse(data) as StreamErrorPayload, at);
    } catch {
      metrics.counter('sse.errors');
    }
  }

  /**
   * Asks where the view stands: the first answer sets the cursor to the frontier (a baseline, as for a view without
   * one), a later one queues the gap. A new generation reads the whole list again, as the frontend refetches.
   */
  async function catchup(): Promise<CatchupResult> {
    const started = performance.now();
    try {
      const res = await client.http.post('/me/stream/~catch-up', {
        json: { views: [{ organizationId, productType: product.type, cursor: cursor ?? 0 }] },
        headers,
        name: 'POST /me/stream/~catch-up',
      });
      const ms = performance.now() - started;
      if (!res.ok) return { status: 'failed', frontier: null, ms };
      const answer = res.json() as StreamCatchupResponse;
      const view = answer.views[0];
      if (view?.status !== 'ok' || view.frontier === undefined) return { status: view?.status ?? 'failed', frontier: null, ms };
      spreadWindow = answer.organizations[organizationId]?.spreadWindow ?? null;
      const changedGeneration = generation !== null && answer.generation !== generation;
      generation = answer.generation;
      if (changedGeneration) await readAll();
      if (cursor === null || changedGeneration) cursor = view.frontier;
      announce(view.frontier, spreadWindow);
      return { status: 'ok', frontier: view.frontier, ms };
    } catch {
      metrics.counter('sse.errors');
      return { status: 'failed', frontier: null, ms: performance.now() - started };
    }
  }

  /** Opens the stream and, once it is open, catches up. Resolves after the catchup answered; a gap it found may still be read. */
  async function connect(): Promise<CatchupResult> {
    const controller = new AbortController();
    stream = controller;
    let opened = () => {};
    const open = new Promise<void>((resolve) => {
      opened = resolve;
      setTimeout(resolve, openTimeoutMs).unref();
    });
    streamEnded = client
      .sse('/me/stream', (event) => onEvent(event, opened), { headers, signal: controller.signal, name: 'SSE /me/stream' })
      .then(
        (status) => {
          if (status !== 200 && !controller.signal.aborted) metrics.counter('sse.errors');
        },
        () => {
          if (!controller.signal.aborted) metrics.counter('sse.errors');
        },
      )
      .finally(opened);
    await open;
    return catchup();
  }

  /** Ends the stream. A queued read is dropped, unless `flush` reads it now, as a tab does when it hides. */
  async function disconnect({ flush = false } = {}): Promise<void> {
    stream?.abort();
    stream = null;
    await streamEnded;
    if (timer) clearTimeout(timer);
    timer = null;
    if (flush) await drain();
  }

  /**
   * Reads the whole list as `fetchAllPages` does: the first page, the pages its total promises by `skip` at once, then by
   * token while a last page names a next one. The client then holds exactly those rows.
   */
  async function readAll(pageSize = chunkSize): Promise<{ pages: number; firstPageMs: number; totalMs: number }> {
    const started = performance.now();
    const read = async (query: Record<string, string>) => {
      const res = await client.http.get(`${listPath}?${new URLSearchParams({ maxPageSize: String(pageSize), ...query })}`, {
        headers,
        name: `${listName} (page)`,
      });
      if (!res.ok) throw new Error(`${listName} answered ${res.status}`);
      return res.json() as { results: Row[]; nextPageToken?: string; totalSize: number };
    };
    const first = await read({});
    const firstPageMs = performance.now() - started;
    const size = first.results.length;
    const remaining = first.nextPageToken && size > 0 ? Math.ceil((first.totalSize - size) / size) : 0;
    const pages = [first, ...(await Promise.all(Array.from({ length: remaining }, (_, i) => read({ skip: String((i + 1) * size) }))))];
    let last = pages[pages.length - 1];
    while (last.nextPageToken) {
      last = await read({ pageToken: last.nextPageToken });
      pages.push(last);
    }
    rows.clear();
    const at = performance.now();
    for (const page of pages) for (const row of page.results) apply(row, at);
    return { pages: pages.length, firstPageMs, totalMs: performance.now() - started };
  }

  return {
    rows,
    sourceId,
    /** The sequence position up to which the client has read everything; null before its first catchup. */
    get cursor() {
      return cursor;
    },
    /** Whether a read is queued or running. */
    get busy() {
      return reading || timer !== null;
    },
    /** The key of the newest frame heard, and the URL of the last range read that was answered. */
    get rangeKey() {
      return rangeKey;
    },
    get lastRangeUrl() {
      return lastRangeUrl;
    },
    connect,
    disconnect,
    catchup,
    readAll,
  };
}

export type SyncClient = ReturnType<typeof createSyncClient>;
