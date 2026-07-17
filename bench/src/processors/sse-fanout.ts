import { BASE_URL, SSE_HOLD_MS, SSE_SYNC_MODE } from '../config';
import { ORG_ID, TENANT_ID } from '../seeds/ids';

export { buildAttachmentEditPayload } from './attachment-edit';
export { authenticate } from './auth';

/**
 * SSE fan-out subscriber: opens the app stream and reacts to notifications like the
 * frontend's lazy-sync scheduler: merge ranges per scope, wait the negotiated delay
 * (`hash(clientId:scope) % syncWindow`), then issue ONE delta fetch for the merged range.
 *
 * `SYNC_MODE=immediate` disables merging/spreading (fetch per notification, delay 0) to
 * provide a per-notification baseline. Run both modes to compare:
 *
 *   SYNC_MODE=immediate pnpm bench sse-fanout
 *   SYNC_MODE=lazy      pnpm bench sse-fanout   (default)
 *
 * Emitted metrics: sse.notifications, sync.delta_fetches (merge factor = notifications ÷
 * fetches), sync.reaction_delay_ms (spread), sync.fetch_ms, sse.errors.
 */

const DEFAULT_WINDOW_MS = 15_000;
/** Bench tier: no floor (we measure the spread itself), ceiling like the background tier. */
const TIER_MAX_MS = 30_000;

interface ArtilleryEvents {
  emit(kind: 'counter', name: string, value: number): void;
  emit(kind: 'histogram', name: string, value: number): void;
}

interface Notification {
  kind: string;
  entityType: string | null;
  seq: number | null;
  batchUntilSeq: number | null;
  syncWindow: number | null;
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

export async function subscribeAndReact(
  context: { vars: Record<string, unknown> },
  events: ArtilleryEvents,
): Promise<void> {
  const cookie = context.vars.cookie as string;
  const clientId = `vu-${context.vars.userIndex}`;

  // Mini-scheduler state: one pending merged range per scope.
  const pending = new Map<string, { from: number; until: number; timer?: NodeJS.Timeout }>();
  const timers = new Set<NodeJS.Timeout>();

  const deltaFetch = async (from: number, until: number) => {
    const started = Date.now();
    try {
      const res = await fetch(`${BASE_URL}/${TENANT_ID}/${ORG_ID}/attachments?seqCursor=${from},${until}&limit=1000`, {
        headers: { cookie },
      });
      await res.json();
      events.emit('histogram', 'sync.fetch_ms', Date.now() - started);
      events.emit('counter', 'sync.delta_fetches', 1);
      if (!res.ok) events.emit('counter', 'sse.errors', 1);
    } catch {
      events.emit('counter', 'sse.errors', 1);
    }
  };

  const onNotification = (n: Notification) => {
    if (n.kind !== 'entity' || n.seq == null) return;
    events.emit('counter', 'sse.notifications', 1);
    const until = n.batchUntilSeq ?? n.seq;
    const scope = `${n.entityType}:${n.channelId ?? n.organizationId}`;

    if (SSE_SYNC_MODE === 'immediate') {
      events.emit('histogram', 'sync.reaction_delay_ms', 0);
      void deltaFetch(n.seq, until);
      return;
    }

    const entry = pending.get(scope);
    if (entry) {
      // Merge: the pending flush will cover this range too. No new fetch scheduled.
      entry.from = Math.min(entry.from, n.seq);
      entry.until = Math.max(entry.until, until);
      return;
    }

    const window = n.syncWindow || DEFAULT_WINDOW_MS;
    const delay = Math.min(hashSpread(`${clientId}:${scope}`) % window, TIER_MAX_MS);
    events.emit('histogram', 'sync.reaction_delay_ms', delay);

    const created = { from: n.seq, until };
    pending.set(scope, created);
    const timer = setTimeout(() => {
      pending.delete(scope);
      timers.delete(timer);
      void deltaFetch(created.from, created.until);
    }, delay);
    timers.add(timer);
    pending.set(scope, { ...created, timer });
  };

  // ── SSE read loop ─────────────────────────────────────────────────────────
  const controller = new AbortController();
  const holdTimer = setTimeout(() => controller.abort(), SSE_HOLD_MS);

  try {
    const started = Date.now();
    const res = await fetch(`${BASE_URL}/entities/app/stream`, {
      headers: { cookie, accept: 'text/event-stream' },
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      events.emit('counter', 'sse.errors', 1);
      return;
    }
    events.emit('histogram', 'sse.connect_ms', Date.now() - started);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line; keep the trailing partial frame buffered.
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        let event = 'message';
        let data = '';
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (event !== 'change' || !data) continue;
        try {
          onNotification(JSON.parse(data) as Notification);
        } catch {
          events.emit('counter', 'sse.errors', 1);
        }
      }
    }
  } catch (error) {
    if ((error as Error).name !== 'AbortError') events.emit('counter', 'sse.errors', 1);
  } finally {
    clearTimeout(holdTimer);
    // Flush pending merged ranges before the VU exits, mirroring the tab-hide top-up.
    const leftovers = [...pending.values()];
    for (const timer of timers) clearTimeout(timer);
    pending.clear();
    await Promise.all(leftovers.map((range) => deltaFetch(range.from, range.until)));
  }
}
