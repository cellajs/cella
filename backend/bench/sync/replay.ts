import { performance } from 'node:perf_hooks';
import type { Vu } from '@cellajs/cli/bench';
import { nanoid } from 'nanoid';
import { uuidv7 } from 'uuidv7';
import { benchCookie } from '../bench-user';
import { rowDivergence } from '../verify';
import { createSyncClient, SYNC_COUNTERS, SYNC_HISTOGRAMS, waitFor } from './client';
import type { BenchProduct } from './product';

export const REPLAY_COUNTERS = [...SYNC_COUNTERS, 'bench.rows_written', 'bench.rows_diverged', 'sync.lww_violations', 'sync.replay_refused'] as const;
export const REPLAY_HISTOGRAMS = [...SYNC_HISTOGRAMS, 'sync.replay_write_ms', 'sync.converged_ms'] as const;
type ReplayVu = Vu<(typeof REPLAY_COUNTERS)[number], (typeof REPLAY_HISTOGRAMS)[number]>;

/** A reader that still lacks a replayed row after this time has not converged. */
const convergedWithinMs = 60_000;
/** The rival edits every this many rows of the queue. */
const rivalEvery = 10;

const queueUser = 0;
const rivalUser = 1;
const readerUser = 2;

/** A stored row as an update answers it, with its writer. */
type Answer = Record<string, unknown> & { updatedBy?: { id: string } | null };

/** One queued edit: the row and the value it was queued with, at its intent time. */
interface Queued {
  row: number;
  value: string;
  path: string;
  json: object;
}

/**
 * Per queue size: an offline client queues edits at their intent time, a rival then edits every tenth of those rows
 * online, and the client replays its queue one write at a time in order, as the frontend's queue does. Last writer wins:
 * the rival's rows keep the rival's value, every other row ends with the last value queued for it.
 */
export async function runReplay(vu: ReplayVu, product: BenchProduct, { sizes }: { sizes: number[] }): Promise<void> {
  const reader = createSyncClient({ client: vu.client(), cookie: benchCookie(readerUser), product, mode: 'immediate', metrics: vu });
  await reader.connect();
  const queueClient = vu.client();
  const rivalClient = vu.client();
  const patchName = `PATCH ${product.listPath('')}/:id`;
  const report: { size: number; drainMs: number; perWriteMs: number; convergedMs: number | null }[] = [];

  for (const size of vu.short ? [10] : sizes) {
    const sourceId = uuidv7();
    const intentMs = Date.now();
    const queue: Queued[] = Array.from({ length: size }, (_, k) => {
      const row = k % product.total;
      const value = `bench-replay-${nanoid(8)}`;
      return { row, value, ...product.edit(row, value, { sourceId, intentMs, counter: k, replayed: true }) };
    });

    const expected = new Map<string, string>();
    for (const { row, value } of queue) expected.set(product.rowId(row), value);
    const rivalRows = [...new Set(queue.map(({ row }) => row))].filter((_, i) => i % rivalEvery === 0);
    const rivalSource = uuidv7();
    // The CDC worker records a write that changed the field or the writer, and skips one that moved only `updatedAt` (`parseUpdate`).
    const writerOf = new Map<number, string | undefined>();
    for (const row of rivalRows) {
      const value = `bench-rival-${nanoid(8)}`;
      const edit = product.edit(row, value, { sourceId: rivalSource, intentMs: Date.now() });
      const res = await rivalClient.http.patch(edit.path, { json: edit.json, headers: { cookie: benchCookie(rivalUser) }, name: patchName });
      if (res.status !== 200) continue;
      vu.counter('bench.rows_written');
      writerOf.set(row, (res.json() as Answer).updatedBy?.id);
      expected.set(product.rowId(row), value);
    }

    const drainStarted = performance.now();
    for (const { row, value, path, json } of queue) {
      const started = performance.now();
      const res = await queueClient.http.patch(path, { json, headers: { cookie: benchCookie(queueUser) }, name: `${patchName} (replay)` });
      vu.histogram('sync.replay_write_ms', performance.now() - started);
      if (res.status !== 200) {
        vu.counter('sync.replay_refused');
        continue;
      }
      const stored = res.json() as Answer;
      const writer = stored.updatedBy?.id;
      if (stored[product.field] === value || writer !== writerOf.get(row)) vu.counter('bench.rows_written');
      writerOf.set(row, writer);
    }
    const drainMs = performance.now() - drainStarted;

    const answeredAt = performance.now();
    const ids = [...expected.keys()];
    const waited = await waitFor(() => ids.every((id) => reader.rows.get(id) === expected.get(id)), convergedWithinMs, 10);
    const convergedMs = waited === null ? null : performance.now() - answeredAt;
    if (convergedMs !== null) vu.histogram('sync.converged_ms', convergedMs);

    // The queue's intent against the database proves the merge; the reader against it, the delivery.
    const merge = await rowDivergence(product, ids, [expected]);
    if (merge.count > 0) vu.counter('sync.lww_violations', merge.count);
    const delivery = await rowDivergence(product, ids, [reader.rows]);
    if (delivery.count > 0) vu.counter('bench.rows_diverged', delivery.count);
    for (const finding of [...merge.findings, ...delivery.findings]) vu.log(finding);

    report.push({ size, drainMs, perWriteMs: drainMs / size, convergedMs });
    vu.log(
      `queue ${size}: drained in ${(drainMs / 1000).toFixed(2)} s (${(drainMs / size).toFixed(1)} ms per write), reader converged ${convergedMs === null ? 'never' : `${convergedMs.toFixed(0)} ms`} after`,
    );
  }

  await reader.disconnect();
  vu.attach('offline-replay', report);
}
