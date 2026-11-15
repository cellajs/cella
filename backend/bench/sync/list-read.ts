import type { Vu } from '@cellajs/cli/bench';
import { benchCookie } from '../bench-user';
import { rowDivergence } from '../verify';
import { createSyncClient, SYNC_COUNTERS, SYNC_HISTOGRAMS } from './client';
import type { BenchProduct } from './product';

export const LIST_COUNTERS = [...SYNC_COUNTERS, 'bench.rows_diverged', 'sync.list_incomplete'] as const;
export const LIST_HISTOGRAMS = [...SYNC_HISTOGRAMS, 'sync.first_page_ms', 'sync.full_list_ms'] as const;
type ListVu = Vu<(typeof LIST_COUNTERS)[number], (typeof LIST_HISTOGRAMS)[number]>;

export interface ListTarget {
  organizationId: string;
  organizationPath: string;
  /** The ids the list holds, as seeded. */
  ids: string[];
  readerUser: number;
}

/** A fresh client, on a connection of its own, reads the whole list `reads` times; the last read is compared with the database. */
export async function runListRead(vu: ListVu, product: BenchProduct, target: ListTarget, { reads }: { reads: number }): Promise<void> {
  let rows: ReadonlyMap<string, string> = new Map();
  for (let i = 0; i < (vu.short ? 1 : reads); i++) {
    const client = createSyncClient({
      client: vu.client(),
      cookie: benchCookie(target.readerUser),
      product,
      mode: 'off',
      metrics: vu,
      organizationId: target.organizationId,
      organizationPath: target.organizationPath,
    });
    const { pages, firstPageMs, totalMs } = await client.readAll();
    vu.histogram('sync.first_page_ms', firstPageMs);
    vu.histogram('sync.full_list_ms', totalMs);
    if (client.rows.size !== target.ids.length) {
      vu.counter('sync.list_incomplete');
      vu.log(`read ${client.rows.size} of ${target.ids.length} rows in ${pages} pages: re-seed after changing LIST_ROWS`);
    }
    rows = client.rows;
  }
  const { count, findings } = await rowDivergence(product, target.ids, [rows]);
  if (count > 0) vu.counter('bench.rows_diverged', count);
  for (const finding of findings) vu.log(finding);
}
