import { performance } from 'node:perf_hooks';
import type { Vu } from '@cellajs/cli/bench';
import { nanoid } from 'nanoid';
import { uuidv7 } from 'uuidv7';
import { benchCookie } from '../bench-user';
import { rowDivergence } from '../verify';
import { createSyncClient, SYNC_COUNTERS, SYNC_HISTOGRAMS, type SyncClient, waitFor } from './client';
import type { BenchProduct } from './product';

export const CATCHUP_COUNTERS = [
  ...SYNC_COUNTERS,
  'bench.rows_written',
  'bench.rows_diverged',
  'sync.heard_while_away',
  'sync.not_caught_up',
] as const;
export const CATCHUP_HISTOGRAMS = [...SYNC_HISTOGRAMS, 'sync.catchup_ms', 'sync.caught_up_ms', 'sync.all_caught_up_ms'] as const;
type CatchupVu = Vu<(typeof CATCHUP_COUNTERS)[number], (typeof CATCHUP_HISTOGRAMS)[number]>;

/** Rows the writer spreads its edits over while the clients are away. */
const editedRows = 50;
/** A spread catchup reads its gap within the server's window, which reaches tens of seconds. */
const caughtUpWithinMs = 90_000;

const writerUser = 0;
const witnessUser = 1;
const firstClientUser = 2;

/**
 * Every client drops its stream at once, as a deploy ends them, while a writer edits and a witness stays connected.
 * The witness proves the edits went out and the cursors prove the clients missed them; then all reconnect together,
 * catch up and read the gap. Caught up means a client's cursor reached the witness's, with no read left.
 */
export async function runCatchup(
  vu: CatchupVu,
  product: BenchProduct,
  { clients, edits, mode }: { clients: number; edits: number; mode: 'immediate' | 'spread' },
): Promise<void> {
  const people = vu.short ? 3 : clients;
  const writes = vu.short ? 10 : edits;
  const witness = createSyncClient({ client: vu.client(), cookie: benchCookie(witnessUser), product, mode: 'immediate', metrics: vu });
  const readers: SyncClient[] = Array.from({ length: people }, (_, i) =>
    createSyncClient({ client: vu.client(), cookie: benchCookie(firstClientUser + i), product, mode, metrics: vu }),
  );

  try {
    await witness.connect();
    await Promise.all(readers.map((reader) => reader.connect()));
    await Promise.all(readers.map((reader) => waitFor(() => !reader.busy, caughtUpWithinMs)));
    await Promise.all(readers.map((reader) => reader.disconnect()));
    const awayAt = readers.map((reader) => reader.cursor);

    const { http } = vu.client();
    const cookie = benchCookie(writerUser);
    const sourceId = uuidv7();
    /** The last value written per row id: what every client must hold in the end. */
    const written = new Map<string, string>();
    for (let i = 0; i < writes; i++) {
      const row = i % Math.min(editedRows, product.total);
      const value = `bench-catchup-${nanoid(8)}`;
      const edit = product.edit(row, value, { sourceId, intentMs: Date.now() });
      const res = await http.patch(edit.path, { json: edit.json, headers: { cookie }, name: `PATCH ${product.listPath('')}/:id` });
      if (res.status !== 200) continue;
      vu.counter('bench.rows_written');
      written.set(product.rowId(row), value);
    }

    // The outage is proven: the witness holds every row's last value while no reader moved its cursor. A frame names a
    // row once per interval, with its latest change: the witness is judged by what it holds, not by each edit heard.
    const witnessed = () => [...written].every(([id, value]) => witness.rows.get(id) === value);
    if ((await waitFor(() => witnessed() && !witness.busy, caughtUpWithinMs)) === null) throw new Error('the witness never held every written row');
    const target = witness.cursor ?? 0;
    readers.forEach((reader, i) => {
      if (reader.cursor !== awayAt[i]) vu.counter('sync.heard_while_away');
    });

    const reconnectAt = performance.now();
    await Promise.all(
      readers.map(async (reader) => {
        const { status, ms } = await reader.connect();
        vu.histogram('sync.catchup_ms', ms);
        const waited = status === 'ok' ? await waitFor(() => (reader.cursor ?? 0) >= target && !reader.busy, caughtUpWithinMs, 5) : null;
        if (waited === null) vu.counter('sync.not_caught_up');
        else vu.histogram('sync.caught_up_ms', performance.now() - reconnectAt);
      }),
    );
    vu.histogram('sync.all_caught_up_ms', performance.now() - reconnectAt);

    const { count, findings } = await rowDivergence(product, [...written.keys()], [witness.rows, ...readers.map((reader) => reader.rows)]);
    if (count > 0) vu.counter('bench.rows_diverged', count);
    for (const finding of findings) vu.log(finding);
  } finally {
    await Promise.all([witness, ...readers].map((client) => client.disconnect()));
  }
}
