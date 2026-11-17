import { performance } from 'node:perf_hooks';
import { defineScenario } from '@cellajs/cli/bench';
import { nanoid } from 'nanoid';
import { uuidv7 } from 'uuidv7';
import { attachmentProduct } from '../attachment-requests';
import { benchUser } from '../bench-user';
import { SSE_FANOUT } from '../config';
import { createSyncClient, SYNC_COUNTERS, SYNC_HISTOGRAMS } from '../sync/client';

/** Subscribers whose stream is open, by VU index: an edit waits for the ones open when it was sent. */
const listening = new Set<number>();
/** Edits not yet heard by every subscriber that was listening: when the writer sent each, and who has not heard it. */
const edits = new Map<string, { sentAt: number; waiting: Set<number> }>();

/**
 * Nine in ten VUs subscribe and read what the stream announces in the slot the frontend's scheduler takes (one read per
 * scope at a time, in the server's spread window); one in ten writes edits. `SSE_SYNC_MODE=immediate` reads each
 * announcement at once, for comparison. `sync.heard_ms` and `sync.all_heard_ms` count from the writer's call.
 */
export default defineScenario({
  description: 'many live subscribers fetching what the stream announces',
  phases: [
    { name: 'ramp subscribers', duration: 10, arrivalRate: 8 },
    { name: 'hold with writes', duration: 20, arrivalRate: 12 },
  ],
  counters: [...SYNC_COUNTERS, 'bench.rows_written'],
  histograms: [...SYNC_HISTOGRAMS, 'sync.heard_ms', 'sync.all_heard_ms'],
  primary: 'sync.fetch_ms.p95',
  checks: { maxErrorShare: 5, expect: ['sse.changes', 'sync.range_fetches'], forbid: ['sse.errors'] },
  roles: [
    {
      name: 'subscriber',
      weight: 9,
      async vu(vu) {
        const { cookie } = benchUser(vu.index);
        const client = createSyncClient({
          client: vu,
          cookie,
          product: attachmentProduct,
          mode: SSE_FANOUT.syncMode === 'immediate' ? 'immediate' : 'spread',
          metrics: vu,
          onChange(change, at) {
            for (const row of change.rows) {
              const edit = row.stx ? edits.get(row.stx.mutationId) : undefined;
              if (!edit?.waiting.delete(vu.index)) continue;
              vu.histogram('sync.heard_ms', at - edit.sentAt);
              if (edit.waiting.size > 0) continue;
              vu.histogram('sync.all_heard_ms', at - edit.sentAt);
              edits.delete(row.stx?.mutationId ?? '');
            }
          },
        });
        await client.connect();
        listening.add(vu.index);
        try {
          await vu.think(SSE_FANOUT.holdMs).catch(() => {});
        } finally {
          listening.delete(vu.index);
          for (const [mutationId, edit] of edits) if (edit.waiting.delete(vu.index) && edit.waiting.size === 0) edits.delete(mutationId);
          // A queued read is made before the VU ends, as a tab reads when it hides.
          await client.disconnect({ flush: true });
        }
      },
    },
    {
      name: 'writer',
      weight: 1,
      async vu(vu) {
        const { cookie, userIndex } = benchUser(vu.index);
        for (let i = 0; i < 20; i++) {
          const edit = attachmentProduct.edit(userIndex % attachmentProduct.total, `bench-attachment-${nanoid(8)}`, {
            sourceId: uuidv7(),
            intentMs: Date.now(),
          });
          if (listening.size > 0) edits.set(edit.mutationId, { sentAt: performance.now(), waiting: new Set(listening) });
          const res = await vu.http.patch(edit.path, { json: edit.json, headers: { cookie }, name: 'PATCH /attachments/:id' });
          if (res.status === 200) vu.counter('bench.rows_written');
          else edits.delete(edit.mutationId);
          await vu.think(500);
        }
      },
    },
  ],
});
