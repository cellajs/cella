import { attachmentEdit } from '../src/attachment-requests';
import { benchUser, ORG_PATH } from '../src/bench-user';
import { SSE_HOLD_MS, SSE_SYNC_MODE } from '../src/config';
import { defineScenario } from '../src/runner';

const DEFAULT_WINDOW_MS = 15_000;
/** Bench tier: no floor (the spread itself is measured), ceiling like the background tier. */
const TIER_MAX_MS = 30_000;

/** An app-stream change: product rows of one `productType`. */
interface StreamChange {
  productType: string;
  seq: number | null;
  batchUntilSeq: number | null;
  spreadWindow: number | null;
  channelId: string | null;
  organizationId: string | null;
}

/** FNV-1a 32-bit: same deterministic jitter as the frontend scheduler. */
function hashSpread(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Nine in ten VUs subscribe and react like the frontend's lazy-sync scheduler (merge per scope, then a slot in the
 * server's spread window); one in ten writes edits. `SYNC_MODE=immediate` fetches per change for comparison.
 */
export default defineScenario({
  description: 'SSE fan-out: announce-then-fetch under many live subscribers.',
  phases: [
    { name: 'ramp subscribers', duration: 10, arrivalRate: 8 },
    { name: 'hold with writes', duration: 20, arrivalRate: 12 },
  ],
  counters: ['bench.rows_written', 'sse.changes', 'sync.range_fetches', 'sse.errors'],
  histograms: ['sync.fetch_ms', 'sync.reaction_delay_ms'],
  primary: 'sync.fetch_ms.p95',
  checks: { maxErrorRate: 5, expect: ['sse.changes', 'sync.range_fetches'], forbid: ['sse.errors'] },
  roles: [
    {
      name: 'subscriber',
      weight: 9,
      async vu(vu) {
        const { cookie, userIndex } = benchUser(vu.index);
        const clientId = `vu-${userIndex}`;
        const pending = new Map<string, { from: number; until: number }>();
        const timers = new Set<NodeJS.Timeout>();

        const rangeFetch = async (from: number, until: number) => {
          const started = performance.now();
          try {
            const res = await vu.http.get(`${ORG_PATH}/attachments?afterSeq=${from - 1}&untilSeq=${until}&limit=1000`, {
              headers: { cookie },
              name: 'GET /attachments (range)',
            });
            vu.histogram('sync.fetch_ms', performance.now() - started);
            vu.counter('sync.range_fetches');
            if (!res.ok) vu.counter('sse.errors');
          } catch {
            vu.counter('sse.errors');
          }
        };

        const onChange = (n: StreamChange) => {
          if (n.seq == null) return;
          vu.counter('sse.changes');
          const until = n.batchUntilSeq ?? n.seq;
          const scope = `${n.productType}:${n.channelId ?? n.organizationId}`;

          if (SSE_SYNC_MODE === 'immediate') {
            vu.histogram('sync.reaction_delay_ms', 0);
            void rangeFetch(n.seq, until);
            return;
          }
          const entry = pending.get(scope);
          if (entry) {
            // The pending flush covers this range too.
            entry.from = Math.min(entry.from, n.seq);
            entry.until = Math.max(entry.until, until);
            return;
          }
          // As the frontend's scheduler: the server's window where it sends one, and no spread inside a window of 0.
          const window = n.spreadWindow ?? DEFAULT_WINDOW_MS;
          const delay = window > 0 ? Math.min(hashSpread(`${clientId}:${scope}`) % window, TIER_MAX_MS) : 0;
          vu.histogram('sync.reaction_delay_ms', delay);
          const range = { from: n.seq, until };
          pending.set(scope, range);
          const timer = setTimeout(() => {
            pending.delete(scope);
            timers.delete(timer);
            void rangeFetch(range.from, range.until);
          }, delay);
          timers.add(timer);
        };

        try {
          const status = await vu.sse(
            '/entities/app/stream',
            ({ event, data }) => {
              if (event !== 'change') return;
              try {
                onChange(JSON.parse(data) as StreamChange);
              } catch {
                vu.counter('sse.errors');
              }
            },
            { headers: { cookie }, signal: AbortSignal.timeout(SSE_HOLD_MS), name: 'SSE /entities/app/stream' },
          );
          if (status !== 200) vu.counter('sse.errors');
        } catch {
          vu.counter('sse.errors');
        } finally {
          // Pending merged ranges are fetched before the VU exits, like the tab-hide top-up.
          for (const timer of timers) clearTimeout(timer);
          const leftovers = [...pending.values()];
          pending.clear();
          await Promise.all(leftovers.map((range) => rangeFetch(range.from, range.until)));
        }
      },
    },
    {
      name: 'writer',
      weight: 1,
      async vu(vu) {
        const { cookie, userIndex } = benchUser(vu.index);
        for (let i = 0; i < 20; i++) {
          const { path, json } = attachmentEdit(userIndex);
          const res = await vu.http.put(path, { json, headers: { cookie }, name: 'PUT /attachments/:id' });
          if (res.status === 200) vu.counter('bench.rows_written');
          await vu.think(500);
        }
      },
    },
  ],
});
