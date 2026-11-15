import { performance } from 'node:perf_hooks';
import type { Vu } from '@cellajs/cli/bench';
import { nanoid } from 'nanoid';
import { uuidv7 } from 'uuidv7';
import { benchCookie } from '../bench-user';
import { rowDivergence } from '../verify';
import { createSyncClient, SYNC_COUNTERS, SYNC_HISTOGRAMS, waitFor } from './client';
import type { BenchProduct } from './product';

export const PROPAGATION_COUNTERS = [...SYNC_COUNTERS, 'bench.rows_written', 'bench.rows_diverged', 'sync.lost'] as const;
export const PROPAGATION_HISTOGRAMS = [...SYNC_HISTOGRAMS, 'sync.accepted_ms', 'sync.heard_ms', 'sync.visible_ms'] as const;
type PropagationVu = Vu<(typeof PROPAGATION_COUNTERS)[number], (typeof PROPAGATION_HISTOGRAMS)[number]>;

/** An edit that reached no reader in this time counts as lost. */
const lostAfterMs = 10_000;
/** Writers that share the busy variant's background rate, each on a connection of its own. */
const backgroundWriters = 10;
/** Background load runs this long before the first measured edit. */
const loadRampMs = 2_000;

const writerUser = 0;
const readerUser = 1;
/** The probed row; background writers edit the rows after it. */
const probeRow = 0;

interface Probe {
  mutationId: string;
  value: string;
  sentAt: number;
  heardAt?: number;
  visibleAt?: number;
}

/** Edits other rows at `perSecond` until `stop` aborts, spread over the background writers. */
async function backgroundLoad(vu: PropagationVu, product: BenchProduct, perSecond: number, stop: AbortSignal): Promise<void> {
  const intervalMs = (backgroundWriters * 1000) / perSecond;
  await Promise.all(
    Array.from({ length: backgroundWriters }, async (_, w) => {
      const { http } = vu.client();
      const cookie = benchCookie(writerUser + 2 + w);
      const sourceId = uuidv7();
      for (let i = 0; !stop.aborted; i++) {
        const row = probeRow + 1 + ((w + i * backgroundWriters) % (product.total - 1));
        const edit = product.edit(row, `bench-load-${nanoid(8)}`, { sourceId, intentMs: Date.now() });
        const started = performance.now();
        const res = await http
          .patch(edit.path, { json: edit.json, headers: { cookie }, name: `PATCH ${product.listPath('')}/:id` })
          .catch(() => null);
        if (res?.status === 200) vu.counter('bench.rows_written');
        const wait = intervalMs - (performance.now() - started);
        if (wait > 0 && !stop.aborted) await vu.think(wait).catch(() => {});
      }
    }),
  );
}

/**
 * One writer edits one row at a time and one reader views its channel (reads what it hears at once). Each sample counts
 * from the writer's call to three independent observations: the writer's answer, the reader's change frame naming the
 * edit, and the reader's read returning the new value. The next edit waits until the reader holds the last one. With
 * `loadPerSecond`, background writers edit other rows meanwhile.
 */
export async function runPropagation(
  vu: PropagationVu,
  product: BenchProduct,
  { edits, warmups, loadPerSecond }: { edits: number; warmups: number; loadPerSecond: number },
): Promise<void> {
  const measured = vu.short ? 3 : edits;
  const skipped = vu.short ? 1 : warmups;
  const probeId = product.rowId(probeRow);
  let probe: Probe | null = null;

  const reader = createSyncClient({
    client: vu.client(),
    cookie: benchCookie(readerUser),
    product,
    mode: 'immediate',
    metrics: vu,
    onChange(change, at) {
      if (probe && probe.heardAt === undefined && change.rows.some((row) => row.stx?.mutationId === probe?.mutationId)) probe.heardAt = at;
    },
    onRead(id, value, at) {
      if (probe && probe.visibleAt === undefined && id === probeId && value === probe.value) probe.visibleAt = at;
    },
  });
  await reader.connect();

  const stopLoad = new AbortController();
  const load = loadPerSecond > 0 ? backgroundLoad(vu, product, vu.short ? Math.min(loadPerSecond, 10) : loadPerSecond, stopLoad.signal) : null;
  if (load) await vu.think(vu.short ? 200 : loadRampMs);

  const { http } = vu.client();
  const cookie = benchCookie(writerUser);
  const sourceId = uuidv7();
  try {
    for (let i = 0; i < skipped + measured; i++) {
      const value = `bench-propagation-${nanoid(8)}`;
      const edit = product.edit(probeRow, value, { sourceId, intentMs: Date.now() });
      const current: Probe = { mutationId: edit.mutationId, value, sentAt: performance.now() };
      probe = current;
      const res = await http.patch(edit.path, { json: edit.json, headers: { cookie }, name: `PATCH ${product.listPath('')}/:id` });
      const acceptedAt = performance.now();
      if (res.status !== 200) continue;
      vu.counter('bench.rows_written');
      if ((await waitFor(() => current.visibleAt !== undefined, lostAfterMs, 5)) === null) {
        vu.counter('sync.lost');
        continue;
      }
      if (i < skipped) continue;
      vu.histogram('sync.accepted_ms', acceptedAt - current.sentAt);
      if (current.heardAt !== undefined) vu.histogram('sync.heard_ms', current.heardAt - current.sentAt);
      vu.histogram('sync.visible_ms', (current.visibleAt ?? acceptedAt) - current.sentAt);
    }
  } finally {
    stopLoad.abort();
    await load;
    await reader.disconnect({ flush: true });
  }

  const { count, findings } = await rowDivergence(product, [probeId], [reader.rows]);
  if (count > 0) vu.counter('bench.rows_diverged', count);
  for (const finding of findings) vu.log(finding);
}
