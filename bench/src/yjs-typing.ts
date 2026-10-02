import { writeFileSync } from 'node:fs';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import process from 'node:process';
import * as decoding from 'lib0/decoding';
import pg from 'pg';
import pc from 'picocolors';
import { BENCH_UUID_PREFIX } from 'shared/utils/bench-identity';
import WebSocket from 'ws';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import {
  BACKEND_PORT,
  BASE_URL,
  BENCH_SHORT,
  CDC_HEALTH_PORT,
  CDC_HEALTH_URL,
  COOKIE_SECRET,
  DB_URL,
  SESSION_COOKIE_NAME,
  YJS_HEALTH_URL,
  YJS_PORT,
  YJS_TYPING,
  YJS_URL,
} from './config';
import { attachmentId, ORG_ID, TENANT_ID } from './seeds/ids';
import { sealSessionCookie, sessionToken } from './seeds/session-auth';
import { TOTAL_USERS } from './seeds/user-constants';
import { type DbCounters, startStackSampler, type WindowSummary, walBytesBetween } from './stack-sampler';

/** Message types on the relay socket: y-websocket's sync, and the relay's own `Generation` and `Saved` (yjs/src/sync/relay.ts). */
const MESSAGE = { sync: 0, generation: 4, saved: 5 } as const;
const SYNC = { step2: 1, update: 2 } as const;
/** The relay's log channel: every append notifies there since release 2, so a listener counts the relay's pg_notify volume. */
const LOG_CHANNEL = 'yjs_log';
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz     ';
/** Typing before this point warms the stack up: DB rates and CPU are read from the rest of the window. */
const WARMUP_MS = 10_000;
/** pg_stat counters reach pg_stat_* when a backend idles, at least every ten seconds: the tail snapshot waits past that. */
const STATS_FLUSH_MS = 12_000;

interface YjsTypingOptions {
  docs: number;
  typers: number;
  durationMs: number;
  keystrokeMs: [number, number];
  sseViewers: number;
  docOffset: number;
  /**
   * Documents start typing spread over this window, by default the relay's compaction max wait: started together, every
   * document materializes in the same second, every ten seconds, which people opening documents at their own time never do.
   */
  staggerMs: number;
  /** First bench user of the run; every client and SSE viewer is a user of its own, as in a real team. */
  userOffset: number;
  /** Longest wait after typing for every edit to be saved, converged and written to the entity row. */
  settleMs: number;
}

/** The scenario shape from YJS_* variables; `--short` shrinks it to a smoke run. */
function yjsTypingOptions(): YjsTypingOptions {
  const base = { docOffset: YJS_TYPING.docOffset, staggerMs: YJS_TYPING.staggerS * 1000, userOffset: 600, keystrokeMs: YJS_TYPING.keystrokeMs };
  if (BENCH_SHORT) return { ...base, docs: 2, typers: 2, durationMs: 5000, sseViewers: 1, settleMs: 20_000 };
  return {
    ...base,
    docs: YJS_TYPING.docs,
    typers: YJS_TYPING.typers,
    durationMs: YJS_TYPING.durationS * 1000,
    sseViewers: YJS_TYPING.sseViewers ?? YJS_TYPING.docs,
    settleMs: 30_000,
  };
}

/** Every latency sample of a run, for Artillery's histograms: `--samples` adds them to the JSON report. */
export interface YjsTypingSamples {
  peerMs: number[];
  savedMs: number[];
  notifyDelayMs: number[];
}

interface Percentiles {
  count: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

function percentiles(values: number[]): Percentiles {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => (sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]);
  return { count: sorted.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: sorted.at(-1) ?? 0 };
}

type Phase = 'setup' | 'typing' | 'settle';

/** Shared state of one run: what the clients measure, and counters by name. */
interface RunState {
  phase: Phase;
  /** Send time of each typed character, by `clientId:clock`, until the document's viewer receives it. */
  sentAt: Map<string, number>;
  peerMs: number[];
  savedMs: number[];
  notifyDelayMs: number[];
  counters: Record<string, number>;
}

const bump = (run: RunState, name: string, by = 1) => {
  run.counters[name] = (run.counters[name] ?? 0) + by;
};

interface Client {
  role: 'typer' | 'viewer';
  docIndex: number;
  doc: Y.Doc;
  provider: WebsocketProvider;
  /** Send times of the Step2 and Update frames the open socket sent that no `Saved` answered yet. */
  unsaved: number[];
  saved: number;
  sockets: number;
  generation: string | null;
}

const cookieFor = (userIndex: number) =>
  `${SESSION_COOKIE_NAME}=${encodeURIComponent(sealSessionCookie(SESSION_COOKIE_NAME, sessionToken(userIndex), COOKIE_SECRET, 3600))}`;

async function mintToken(docIndex: number, userIndex: number): Promise<string> {
  const url = `${BASE_URL}/${TENANT_ID}/${ORG_ID}/yjs/token?entityType=attachment&entityId=${attachmentId(docIndex)}`;
  const res = await fetch(url, { headers: { cookie: cookieFor(userIndex) } });
  if (!res.ok) throw new Error(`token for attachment ${docIndex} answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { token: string }).token;
}

/** Runs `fn` over `items`, `limit` at a time. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Polls `done` every 50 ms; resolves to the wait in ms, or null at the timeout. */
async function waitFor(done: () => boolean | Promise<boolean>, timeoutMs: number): Promise<number | null> {
  const started = performance.now();
  while (!(await done())) {
    if (performance.now() - started > timeoutMs) return null;
    await sleep(50);
  }
  return performance.now() - started;
}

/** The sync subtype of a frame y-websocket sends; null for any other message. */
function syncSubtype(data: unknown): number | null {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data instanceof Uint8Array ? data : null;
  if (!bytes || bytes.length < 2) return null;
  const decoder = decoding.createDecoder(bytes);
  return decoding.readVarUint(decoder) === MESSAGE.sync ? decoding.readVarUint(decoder) : null;
}

/** A `ws` socket that stamps every Step2 and Update frame it sends, which the relay answers with `Saved` in order. */
function ledgerSocket(client: Client): typeof globalThis.WebSocket {
  const Base = WebSocket as unknown as new (address: string, protocols?: string | string[]) => { send(data: unknown): void };
  class LedgerSocket extends Base {
    constructor(address: string, protocols?: string | string[]) {
      super(address, protocols);
      client.unsaved = [];
      client.sockets++;
    }

    send(data: unknown) {
      const subtype = syncSubtype(data);
      if (subtype === SYNC.step2 || subtype === SYNC.update) client.unsaved.push(performance.now());
      super.send(data);
    }
  }
  return LedgerSocket as unknown as typeof globalThis.WebSocket;
}

function openClient(run: RunState, role: Client['role'], docIndex: number, token: string): Client {
  const doc = new Y.Doc();
  const client = { role, docIndex, doc, unsaved: [], saved: 0, sockets: 0, generation: null } as unknown as Client;
  const provider = new WebsocketProvider(YJS_URL, attachmentId(docIndex), doc, {
    connect: false,
    // Node has BroadcastChannel: without this, clients in this process would sync past the relay.
    disableBc: true,
    params: { token, entityType: 'attachment', tenantId: TENANT_ID },
    maxBackoffTime: 30_000,
    WebSocketPolyfill: ledgerSocket(client),
  });
  client.provider = provider;
  provider.messageHandlers[MESSAGE.generation] = (_encoder, decoder) => {
    const generation = decoding.readVarString(decoder);
    if (client.generation !== null && client.generation !== generation) bump(run, 'yjs.generation_changes');
    client.generation = generation;
  };
  provider.messageHandlers[MESSAGE.saved] = () => {
    client.saved++;
    const sentAt = client.unsaved.shift();
    if (sentAt !== undefined && run.phase !== 'setup') run.savedMs.push(performance.now() - sentAt);
  };
  provider.on('connection-close', (event) => {
    if (event) bump(run, `yjs.close.${event.code}`);
  });
  provider.on('connection-error', (event) => {
    const status = /\b(\d{3})\b/.exec(String((event as unknown as { message?: string }).message ?? ''))?.[1];
    bump(run, `yjs.connection_error${status ? `.${status}` : ''}`);
  });
  if (role === 'viewer') {
    // The viewer receives every typer's characters: each one's delay from its keystroke is the peer latency.
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== provider || run.phase === 'setup') return;
      const now = performance.now();
      const meta = Y.parseUpdateMeta(update);
      for (const [clientId, to] of meta.to) {
        for (let clock = meta.from.get(clientId) ?? 0; clock < to; clock++) {
          const key = `${clientId}:${clock}`;
          const sentAt = run.sentAt.get(key);
          if (sentAt === undefined) continue;
          run.sentAt.delete(key);
          run.peerMs.push(now - sentAt);
        }
      }
    });
  }
  return client;
}

/** The first paragraph of the BlockNote fragment, and its text node once someone typed into it. */
function paragraphOf(doc: Y.Doc): { paragraph: Y.XmlElement | null; text: Y.XmlText | null } {
  const queue: (Y.XmlFragment | Y.XmlElement)[] = [doc.getXmlFragment('document-store')];
  while (queue.length > 0) {
    for (const child of (queue.shift() as Y.XmlFragment | Y.XmlElement).toArray()) {
      if (!(child instanceof Y.XmlElement)) continue;
      if (child.nodeName === 'paragraph') {
        const text = child.toArray().find((node): node is Y.XmlText => node instanceof Y.XmlText) ?? null;
        return { paragraph: child, text };
      }
      queue.push(child);
    }
  }
  return { paragraph: null, text: null };
}

const liveText = (client: Client) => paragraphOf(client.doc).text?.toString() ?? '';

/**
 * Gives the document a text node to type into: in the seeded empty paragraph, or, in an empty fragment (a relay that
 * seeds nothing for an empty description), in the first block BlockNote creates there, as the relay's own seed has it.
 */
function prepareParagraph(doc: Y.Doc): void {
  const { paragraph, text } = paragraphOf(doc);
  if (text) return;
  doc.transact(() => {
    if (paragraph) {
      paragraph.insert(0, [new Y.XmlText('bench ')]);
      return;
    }
    const group = new Y.XmlElement('blockGroup');
    doc.getXmlFragment('document-store').insert(0, [group]);
    const container = new Y.XmlElement('blockContainer');
    group.insert(0, [container]);
    container.setAttribute('id', crypto.randomUUID());
    const block = new Y.XmlElement('paragraph');
    container.insert(0, [block]);
    block.setAttribute('backgroundColor', 'default');
    block.setAttribute('textColor', 'default');
    block.setAttribute('textAlignment', 'left');
    block.insert(0, [new Y.XmlText('bench ')]);
  });
}

/** The text of a stored BlockNote description, every block's inline content in order. */
function descriptionText(description: string | null): string {
  if (!description) return '';
  let text = '';
  const visit = (blocks: unknown) => {
    if (!Array.isArray(blocks)) return;
    for (const block of blocks as { content?: unknown; children?: unknown }[]) {
      if (Array.isArray(block.content))
        for (const item of block.content as { text?: unknown }[]) if (typeof item.text === 'string') text += item.text;
      visit(block.children);
    }
  };
  try {
    visit(JSON.parse(description));
  } catch {
    return '';
  }
  return text;
}

interface Typer {
  client: Client;
  text: Y.XmlText;
  cursor: Y.RelativePosition;
  timer?: ReturnType<typeof setTimeout>;
}

/** One keystroke at the typer's own cursor, stamped for the viewer, with the cursor in awareness as an editor moves it. */
function typeOnce(run: RunState, typer: Typer): void {
  const { doc, provider } = typer.client;
  const position = Y.createAbsolutePositionFromRelativePosition(typer.cursor, doc);
  const index = position && position.type === typer.text ? position.index : typer.text.length;
  run.sentAt.set(`${doc.clientID}:${Y.getState(doc.store, doc.clientID)}`, performance.now());
  typer.text.insert(index, ALPHABET[Math.floor(Math.random() * ALPHABET.length)]);
  typer.cursor = Y.createRelativePositionFromTypeIndex(typer.text, index + 1);
  const cursor = Y.relativePositionToJSON(typer.cursor);
  provider.awareness.setLocalStateField('cursor', { anchor: cursor, head: cursor });
  bump(run, 'yjs.keystrokes');
}

/** An SSE change notification: `product` with `productType` and `subjectId` since the entity rename, `entity` before. */
interface StreamChange {
  kind?: string;
  productType?: string;
  entityType?: string;
}

/**
 * One user on the app's SSE stream, counting attachment notifications per phase, as a non-editing viewer sees them. Under
 * load CDC batches changes of one scope into a notification (`count`, `batchUntilSeq`), so notifications are fewer than writes.
 */
async function watchStream(run: RunState, userIndex: number, signal: AbortSignal): Promise<void> {
  try {
    const res = await fetch(`${BASE_URL}/entities/app/stream`, { headers: { cookie: cookieFor(userIndex), accept: 'text/event-stream' }, signal });
    if (!res.ok || !res.body) return bump(run, `sse.error.${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        if (!frame.includes('event: change') && !frame.includes('event:change')) continue;
        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('');
        try {
          const n = JSON.parse(data) as StreamChange;
          if ((n.kind === 'product' ? n.productType : n.entityType) !== 'attachment') continue;
          bump(run, `sse.notifications.${run.phase}`);
        } catch {
          bump(run, 'sse.error.parse');
        }
      }
    }
  } catch (error) {
    if ((error as Error).name !== 'AbortError') bump(run, 'sse.error.stream');
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** The CDC worker's metrics cover a rolling minute: no cumulative count, so events are counted as the activity rows CDC writes. */
interface CdcHealth {
  metrics?: { throughput?: number; processingLatency?: { p95?: number } };
}

interface RelayHealth {
  eventLoopLagMs?: number;
  connections?: number;
  listener?: string;
}

export interface YjsTypingReport {
  options: YjsTypingOptions;
  startedAt: string;
  relay: string;
  /** Whether the relay sent `Saved` frames: release 1 on. */
  savedFrames: boolean;
  keystrokes: number;
  keystrokesPerSec: number;
  peerLatencyMs: Percentiles;
  savedLatencyMs: Percentiles;
  notify: { perSec: number; total: number; probeDelayMs: Percentiles };
  materialize: { perMin: number; total: number; gapMedianS: number; gapMaxS: number; docsNeverWritten: number; tail: number };
  sse: { viewers: number; perSec: number; total: number; tail: number };
  /** Activity rows CDC wrote for the run's documents, one per entity change: `typing` while typing, `events` through the tail. */
  cdc: { typing: number; events: number; perSec: number; p95MaxMs: number; throughputMax: number };
  db: {
    commitsPerSec: number;
    rollbacks: number;
    walKbPerSec: number;
    tupInsertedPerSec: number;
    tupUpdatedPerSec: number;
    tupDeletedPerSec: number;
    tables: Record<string, { ins: number; upd: number; del: number; scans: number }>;
  };
  stack: WindowSummary;
  relayHealth: { lagMaxMs: number; lagMeanMs: number; listener: string | null };
  harnessLoopLagMs: { p50: number; p99: number; max: number };
  end: {
    allSavedMs: number | null;
    /** Frames no `Saved` answered once the wait ended; null for a relay that sends none. */
    unsavedFrames: number | null;
    convergedMs: number | null;
    docsDiverged: number;
    persistedMs: number | null;
    docsNotPersisted: number;
  };
  counters: Record<string, number>;
}

const perSec = (n: number, ms: number) => (ms > 0 ? n / (ms / 1000) : 0);

/**
 * Per document, the seconds from its first keystroke to its first write while typing, between its writes, and from the
 * last one to typing end: how long the entity row stayed behind the live document. `never` counts the documents
 * without one.
 */
function gapsWhileTyping(writes: { id: string; at: number; phase: Phase }[], starts: Map<string, number>, typingEnd: number) {
  const gaps: number[] = [];
  let never = 0;
  for (const [id, start] of starts) {
    // The write that folds the setup paragraph can land after typing started, before a late document's first keystroke.
    const times = writes.filter((w) => w.id === id && w.phase === 'typing' && w.at >= start).map((w) => w.at);
    if (times.length === 0) never++;
    let previous = start;
    for (const at of [...times, typingEnd]) {
      gaps.push((at - previous) / 1000);
      previous = at;
    }
  }
  gaps.sort((a, b) => a - b);
  return { medianS: gaps[Math.floor(gaps.length / 2)] ?? 0, maxS: gaps.at(-1) ?? 0, never };
}

function counterDeltas(from: DbCounters, to: DbCounters) {
  const tables: Record<string, { ins: number; upd: number; del: number; scans: number }> = {};
  for (const [name, t] of Object.entries(to.tables)) {
    const f = from.tables[name] ?? { ins: 0, upd: 0, del: 0, scans: 0 };
    tables[name] = { ins: t.ins - f.ins, upd: t.upd - f.upd, del: t.del - f.del, scans: t.scans - f.scans };
  }
  return { tables, ms: to.at - from.at };
}

/**
 * Collaborative typing over the Yjs relay: `docs` attachments, each with `typers` real y-websocket clients typing one
 * character every `keystrokeMs` and one idle viewer, plus users on the SSE stream. Measures the keystroke-to-peer and
 * keystroke-to-`Saved` latency, the relay's pg_notify volume and delivery delay, materializations and the CDC and SSE
 * fan-out they cause, the stack's CPU, memory and DB connections, and whether every edit was saved, converged and
 * written to the entity row after typing stops.
 */
async function runYjsTyping(options: YjsTypingOptions): Promise<{ report: YjsTypingReport; samples: YjsTypingSamples }> {
  const { docs, typers, durationMs, keystrokeMs, sseViewers, docOffset, staggerMs, userOffset, settleMs } = options;
  const usersNeeded = docs * (typers + 1) + sseViewers;
  if (userOffset + usersNeeded > TOTAL_USERS) throw new Error(`yjs-typing needs ${usersNeeded} bench users from ${userOffset}; ${TOTAL_USERS} exist`);
  if (!(await fetchJson<RelayHealth>(YJS_HEALTH_URL)))
    throw new Error(`The Yjs relay is not reachable at ${YJS_HEALTH_URL}: start it with \`pnpm dev\``);

  const run: RunState = { phase: 'setup', sentAt: new Map(), peerMs: [], savedMs: [], notifyDelayMs: [], counters: {} };
  const admin = new pg.Pool({ connectionString: DB_URL, max: 2 });
  // Per-user connection and stream budgets span runs.
  await admin.query("DELETE FROM rate_limits WHERE key LIKE 'password_%' OR strpos(key, $1) > 0", [BENCH_UUID_PREFIX]).catch(() => undefined);

  const docIndexes = Array.from({ length: docs }, (_, d) => docOffset + d);
  let nextUser = userOffset;
  const plan = docIndexes.flatMap((docIndex) =>
    Array.from({ length: typers + 1 }, (_, k) => ({ docIndex, role: (k < typers ? 'typer' : 'viewer') as Client['role'], userIndex: nextUser++ })),
  );
  const tokens = await mapLimit(plan, 8, (p) => mintToken(p.docIndex, p.userIndex));

  const sampler = await startStackSampler(
    [
      { name: 'relay', port: YJS_PORT },
      { name: 'api', port: BACKEND_PORT },
      { name: 'cdc', port: CDC_HEALTH_PORT },
    ],
    DB_URL,
  );
  const loopLag = monitorEventLoopDelay({ resolution: 10 });
  loopLag.enable();

  // A listener of our own counts every notification on the relay's channel; a probe notifies on it twice a second
  // and times its own delivery, which waits behind the relay's notifications at commit.
  const listener = new pg.Client({ connectionString: DB_URL });
  await listener.connect();
  await listener.query(`LISTEN ${LOG_CHANNEL}`);
  listener.on('notification', ({ channel, payload }) => {
    if (channel !== LOG_CHANNEL) return;
    if (payload?.startsWith('{"probe"')) {
      if (run.phase === 'typing') run.notifyDelayMs.push(performance.now() - (JSON.parse(payload) as { probe: number }).probe);
      return;
    }
    bump(run, `notify.${run.phase}`);
  });

  const sseAbort = new AbortController();
  const streams = Array.from({ length: sseViewers }, () => watchStream(run, nextUser++, sseAbort.signal));

  // Materializations: each one writes the attachment row, so a changed updated_at between polls is one.
  const ids = docIndexes.map((d) => attachmentId(d));
  const writtenAt = new Map<string, number>();
  const writes: { id: string; at: number; phase: Phase }[] = [];
  let pollingWrites = true;
  const writePoller = (async () => {
    while (pollingWrites) {
      const { rows } = await admin
        .query<{ id: string; t: number }>('SELECT id, extract(epoch FROM updated_at) * 1000 AS t FROM attachments WHERE id = ANY($1)', [ids])
        .catch(() => ({ rows: [] as { id: string; t: number }[] }));
      for (const { id, t } of rows) {
        const previous = writtenAt.get(id);
        if (previous !== undefined && Number(t) !== previous) writes.push({ id, at: performance.now(), phase: run.phase });
        writtenAt.set(id, Number(t));
      }
      await sleep(1000);
    }
  })();

  const relayLags: number[] = [];
  let relayListener: string | null = null;
  let polling = true;
  const healthPoller = (async () => {
    while (polling) {
      const health = await fetchJson<RelayHealth>(YJS_HEALTH_URL);
      if (health && run.phase === 'typing') {
        relayLags.push(health.eventLoopLagMs ?? 0);
        relayListener = health.listener ?? relayListener;
      }
      await sleep(2000);
    }
  })();
  const cdcP95s: number[] = [];
  const cdcThroughputs: number[] = [];
  const cdcPoller = (async () => {
    while (polling) {
      const health = await fetchJson<CdcHealth>(CDC_HEALTH_URL);
      if (run.phase !== 'setup' && health?.metrics) {
        cdcP95s.push(health.metrics.processingLatency?.p95 ?? 0);
        cdcThroughputs.push(health.metrics.throughput ?? 0);
      }
      await sleep(3000);
    }
  })();

  // Connect every client, a few milliseconds apart as people open a document, and wait for each first sync.
  process.setMaxListeners(Math.max(process.getMaxListeners(), plan.length + 20));
  const clients: Client[] = [];
  for (const [i, p] of plan.entries()) {
    const client = openClient(run, p.role, p.docIndex, tokens[i]);
    clients.push(client);
    client.provider.connect();
    await sleep(20);
  }
  const syncWait = await waitFor(() => clients.every((c) => c.provider.synced), 60_000);
  if (syncWait === null) bump(run, 'yjs.setup_unsynced', clients.filter((c) => !c.provider.synced).length);

  // The first typer of each document gives it a text node, and everyone waits for it.
  const byDoc = new Map<number, Client[]>();
  for (const c of clients) byDoc.set(c.docIndex, [...(byDoc.get(c.docIndex) ?? []), c]);
  for (const docClients of byDoc.values()) prepareParagraph(docClients[0].doc);
  await waitFor(() => clients.every((c) => paragraphOf(c.doc).text !== null), 15_000);

  const typing: Typer[] = clients
    .filter((c) => c.role === 'typer')
    .map((client) => {
      const text = paragraphOf(client.doc).text as Y.XmlText;
      return { client, text, cursor: Y.createRelativePositionFromTypeIndex(text, Math.floor(Math.random() * (text.length + 1))) };
    });
  for (const typer of typing)
    typer.client.provider.awareness.setLocalStateField('user', { name: `bench ${typer.client.doc.clientID}`, color: '#888' });

  // Typing: every typer at its own random pace, until the duration ends.
  const startCounters = await sampler.counters();
  const typingStart = performance.now();
  const typingStartEpoch = Date.now();
  run.phase = 'typing';
  const [minMs, maxMs] = keystrokeMs;
  const schedule = (typer: Typer, delay = minMs + Math.random() * (maxMs - minMs)) => {
    typer.timer = setTimeout(() => {
      if (run.phase !== 'typing') return;
      typeOnce(run, typer);
      schedule(typer);
    }, delay);
  };
  // Each document's typers start together, documents spread over the stagger window.
  const stagger = Math.min(staggerMs, durationMs / 4);
  const docStarts = new Map(docIndexes.map((d, i) => [attachmentId(d), typingStart + (stagger * i) / docs]));
  for (const typer of typing) {
    const start = docStarts.get(attachmentId(typer.client.docIndex)) as number;
    schedule(typer, start - typingStart + Math.random() * maxMs);
  }

  const prober = new pg.Client({ connectionString: DB_URL });
  await prober.connect();
  // A probe still waiting to commit skips the next tick, counted, so one connection never queues queries.
  let probing = false;
  const probeTimer = setInterval(() => {
    if (probing) return bump(run, 'notify.probe_skipped');
    probing = true;
    prober
      .query('SELECT pg_notify($1, $2)', [LOG_CHANNEL, JSON.stringify({ probe: performance.now() })])
      .catch(() => undefined)
      .finally(() => {
        probing = false;
      });
  }, 500);

  const warmupMs = Math.min(WARMUP_MS, durationMs / 4);
  await sleep(warmupMs);
  const steadyCounters = await sampler.counters();
  const steadyEpoch = Date.now();
  await sleep(durationMs - warmupMs);

  // Typing stops: every edit must be saved, converge on every client and reach the entity row.
  run.phase = 'settle';
  for (const typer of typing) clearTimeout(typer.timer);
  clearInterval(probeTimer);
  const typingMs = performance.now() - typingStart;
  const endCounters = await sampler.counters();
  const endEpoch = Date.now();

  const savedFrames = clients.some((c) => c.saved > 0);
  const allSavedMs = savedFrames ? await waitFor(() => typing.every((t) => t.client.unsaved.length === 0), settleMs) : null;
  const convergedMs = await waitFor(
    () => [...byDoc.values()].every((docClients) => docClients.every((c) => liveText(c) === liveText(docClients[0]))),
    settleMs,
  );
  const docsDiverged = [...byDoc.values()].filter((docClients) => docClients.some((c) => liveText(c) !== liveText(docClients[0]))).length;

  const viewerText = new Map([...byDoc.entries()].map(([d, docClients]) => [attachmentId(d), liveText(docClients.at(-1) as Client)]));
  let notPersisted = docs;
  const persistedMs = await waitFor(async () => {
    const { rows } = await admin.query<{ id: string; description: string | null }>('SELECT id, description FROM attachments WHERE id = ANY($1)', [
      ids,
    ]);
    notPersisted = rows.filter((r) => descriptionText(r.description) !== viewerText.get(r.id)).length;
    return notPersisted === 0;
  }, settleMs);
  const tailWait = STATS_FLUSH_MS - (performance.now() - typingStart - typingMs);
  if (tailWait > 0) await sleep(tailWait);
  const tailCounters = await sampler.counters();
  // pg_stat counters lag a backend that went idle by up to ten seconds, so CDC's activity rows are counted directly.
  const { rows: activityRows } = await admin.query<{ typing: number; total: number }>(
    'SELECT count(*) FILTER (WHERE created_at <= $3)::int AS typing, count(*)::int AS total FROM activities WHERE subject_id = ANY($1) AND created_at >= $2',
    [ids, new Date(typingStartEpoch).toISOString(), new Date(endEpoch).toISOString()],
  );

  // Tear down.
  polling = false;
  pollingWrites = false;
  for (const c of clients) c.provider.destroy();
  for (const c of clients) c.doc.destroy();
  sseAbort.abort();
  await Promise.all([...streams, healthPoller, cdcPoller, writePoller]);
  loopLag.disable();
  await listener.end();
  await prober.end();
  const walBytes = await walBytesBetween(admin, steadyCounters, endCounters);
  const stack = sampler.summarize(steadyEpoch, endEpoch);
  await sampler.stop();
  await admin.end();

  const writeGaps = gapsWhileTyping(writes, docStarts, typingStart + typingMs);

  const steady = counterDeltas(steadyCounters, endCounters);
  const steadyMs = steady.ms;
  const tail = counterDeltas(startCounters, tailCounters);
  const keystrokes = run.counters['yjs.keystrokes'] ?? 0;
  const materializeTyping = writes.filter((w) => w.phase === 'typing').length;
  const sseTyping = run.counters['sse.notifications.typing'] ?? 0;
  const report: YjsTypingReport = {
    options,
    startedAt: new Date(typingStartEpoch).toISOString(),
    relay: YJS_URL,
    savedFrames,
    keystrokes,
    keystrokesPerSec: perSec(keystrokes, typingMs),
    peerLatencyMs: percentiles(run.peerMs),
    savedLatencyMs: percentiles(run.savedMs),
    notify: {
      perSec: perSec(run.counters['notify.typing'] ?? 0, typingMs),
      total: run.counters['notify.typing'] ?? 0,
      probeDelayMs: percentiles(run.notifyDelayMs),
    },
    materialize: {
      perMin: perSec(materializeTyping, typingMs) * 60,
      total: materializeTyping,
      gapMedianS: writeGaps.medianS,
      gapMaxS: writeGaps.maxS,
      docsNeverWritten: writeGaps.never,
      tail: writes.filter((w) => w.phase === 'settle').length,
    },
    sse: {
      viewers: sseViewers,
      perSec: perSec(sseTyping, typingMs),
      total: sseTyping,
      tail: run.counters['sse.notifications.settle'] ?? 0,
    },
    cdc: {
      typing: activityRows[0]?.typing ?? 0,
      events: activityRows[0]?.total ?? 0,
      perSec: perSec(activityRows[0]?.typing ?? 0, typingMs),
      p95MaxMs: cdcP95s.reduce((a, b) => Math.max(a, b), 0),
      throughputMax: cdcThroughputs.reduce((a, b) => Math.max(a, b), 0),
    },
    db: {
      commitsPerSec: perSec(endCounters.commits - steadyCounters.commits, steadyMs),
      rollbacks: tailCounters.rollbacks - startCounters.rollbacks,
      walKbPerSec: perSec(walBytes / 1024, steadyMs),
      tupInsertedPerSec: perSec(endCounters.inserted - steadyCounters.inserted, steadyMs),
      tupUpdatedPerSec: perSec(endCounters.updated - steadyCounters.updated, steadyMs),
      tupDeletedPerSec: perSec(endCounters.deleted - steadyCounters.deleted, steadyMs),
      tables: tail.tables,
    },
    stack,
    relayHealth: {
      lagMaxMs: relayLags.reduce((a, b) => Math.max(a, b), 0),
      lagMeanMs: relayLags.length ? relayLags.reduce((a, b) => a + b, 0) / relayLags.length : 0,
      listener: relayListener,
    },
    harnessLoopLagMs: { p50: loopLag.percentile(50) / 1e6, p99: loopLag.percentile(99) / 1e6, max: loopLag.max / 1e6 },
    end: {
      allSavedMs,
      unsavedFrames: savedFrames ? typing.reduce((n, t) => n + t.client.unsaved.length, 0) : null,
      convergedMs,
      docsDiverged,
      persistedMs,
      docsNotPersisted: notPersisted,
    },
    counters: {
      ...run.counters,
      'yjs.reconnects': clients.reduce((n, c) => n + Math.max(0, c.sockets - 1), 0),
    },
  };

  return { report, samples: { peerMs: run.peerMs, savedMs: run.savedMs, notifyDelayMs: run.notifyDelayMs } };
}

const fmt = (n: number, digits = 1) => (Number.isFinite(n) ? n.toFixed(digits) : '-');
const lat = (p: Percentiles) =>
  p.count === 0 ? pc.dim('n/a') : `p50 ${fmt(p.p50)}  p95 ${fmt(p.p95)}  p99 ${fmt(p.p99)}  max ${fmt(p.max)} ms  (${p.count})`;

function printYjsTypingReport(r: YjsTypingReport): void {
  const o = r.options;
  const row = (label: string, value: string) => console.info(`  ${label.padEnd(24)}${value}`);
  console.info(`\n${pc.bold('yjs-typing')} ${pc.dim(`${o.docs} docs x ${o.typers} typers + 1 viewer, ${o.durationMs / 1000}s, ${r.relay}`)}`);
  row('keystrokes', `${r.keystrokes} (${fmt(r.keystrokesPerSec)}/s)`);
  row('peer latency', lat(r.peerLatencyMs));
  row('saved latency', r.savedFrames ? lat(r.savedLatencyMs) : pc.dim('relay sends no Saved'));
  row('pg_notify', `${fmt(r.notify.perSec)}/s, probe delivery ${lat(r.notify.probeDelayMs)}`);
  row(
    'materializations',
    `${fmt(r.materialize.perMin)}/min, gap median ${fmt(r.materialize.gapMedianS)}s max ${fmt(r.materialize.gapMaxS)}s, never ${r.materialize.docsNeverWritten}, tail ${r.materialize.tail}`,
  );
  row('cdc', `${r.cdc.typing} activities while typing (${fmt(r.cdc.perSec)}/s), ${r.cdc.events} with the tail, p95 max ${r.cdc.p95MaxMs} ms`);
  row('sse', `${r.sse.total} notifications to ${r.sse.viewers} viewers (${fmt(r.sse.perSec)}/s), tail ${r.sse.tail}`);
  row(
    'db',
    `${fmt(r.db.commitsPerSec)} commits/s, WAL ${fmt(r.db.walKbPerSec)} KB/s, ins ${fmt(r.db.tupInsertedPerSec)}/s upd ${fmt(r.db.tupUpdatedPerSec)}/s del ${fmt(r.db.tupDeletedPerSec)}/s`,
  );
  for (const p of r.stack.processes)
    row(`cpu ${p.name}`, `mean ${fmt(p.cpuMeanPct)}%  max ${fmt(p.cpuMaxPct)}%  rss ${fmt(p.rssMaxMb, 0)} MB  db conns ${p.dbConnectionsMax}`);
  if (r.stack.dbContainer) row('cpu postgres', `mean ${fmt(r.stack.dbContainer.cpuMeanPct)}%  max ${fmt(r.stack.dbContainer.cpuMaxPct)}%`);
  const s = r.stack.dbSessions;
  row(
    'db sessions',
    `max ${s.totalMax}, active mean ${fmt(s.activeMean, 2)}, lock waits mean ${fmt(s.lockWaitMean, 2)} max ${s.lockWaitMax}, listeners ${s.listeners}`,
  );
  row(
    'waits',
    Object.entries(r.stack.waitProfile)
      .slice(0, 5)
      .map(([k, v]) => `${k} ${fmt(v * 100, 0)}%`)
      .join(', '),
  );
  row('relay loop lag', `mean ${fmt(r.relayHealth.lagMeanMs)} max ${fmt(r.relayHealth.lagMaxMs)} ms, listener ${r.relayHealth.listener ?? '-'}`);
  row('harness loop lag', `p99 ${fmt(r.harnessLoopLagMs.p99)} max ${fmt(r.harnessLoopLagMs.max)} ms`);
  const e = r.end;
  row(
    'after typing',
    `saved ${e.allSavedMs === null ? '-' : `${fmt(e.allSavedMs, 0)} ms`}, unsaved ${e.unsavedFrames ?? '-'}, converged ${e.convergedMs === null ? 'NO' : `${fmt(e.convergedMs, 0)} ms`} (${e.docsDiverged} diverged), persisted ${e.persistedMs === null ? 'NO' : `${fmt(e.persistedMs, 0)} ms`} (${e.docsNotPersisted} not)`,
  );
  const issues = Object.entries(r.counters).filter(
    ([k]) => k.includes('close') || k.includes('error') || k.includes('reconnect') || k.includes('unsynced') || k.includes('generation'),
  );
  row('errors and closes', issues.length ? issues.map(([k, v]) => `${k}=${v}`).join(', ') : 'none');
  console.info();
}

/** `tsx src/yjs-typing.ts [--out report.json] [--samples]`, with the shape from YJS_* variables. The Artillery processor runs it too. */
async function main(): Promise<void> {
  const outIndex = process.argv.indexOf('--out');
  const { report, samples } = await runYjsTyping(yjsTypingOptions());
  printYjsTypingReport(report);
  const json = process.argv.includes('--samples') ? { ...report, samples } : report;
  if (outIndex > 0 && process.argv[outIndex + 1]) writeFileSync(process.argv[outIndex + 1], `${JSON.stringify(json, null, 2)}\n`);
  process.exit(0);
}

main().catch((error) => {
  console.error(pc.red('yjs-typing failed:'), error);
  process.exit(1);
});
