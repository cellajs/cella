import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { cacheRemove, removeDetailQueriesById } from '~/query/basic/cache-mutations';
import { removePendingMutations } from '~/query/basic/invalidation-helpers';
import type { PreparedVars } from '~/query/offline/prepared-mutation';
import { removePausedCreates } from '~/query/offline/squash-utils';

/** The keys of one product, as `createEntityKeys` builds them. */
interface ProductKeys {
  create: QueryKey;
  update: QueryKey;
  detail: { base: QueryKey };
}

/**
 * The prepare step of a product's delete mutation. A row whose create is still queued offline never reached the
 * server: its create and queued updates are cancelled, and it leaves the list under `listKey` and the detail cache
 * here, without a request. The other rows become the mutation's variables through `toVars`; `noop` when none is left.
 */
export function prepareProductDelete<TRow extends { id: string }, TVars>(
  queryClient: QueryClient,
  keys: ProductKeys,
  listKey: QueryKey,
  rows: TRow[],
  toVars: (rows: TRow[]) => TVars,
): PreparedVars<TVars> {
  const rowIds = rows.map(({ id }) => id);
  const cancelled = new Set(removePausedCreates(queryClient, keys.create, rowIds));

  if (cancelled.size > 0) {
    const localOnly = rows.filter((row) => cancelled.has(row.id));
    const localOnlyIds = localOnly.map(({ id }) => id);
    removePendingMutations(queryClient, keys.update, localOnlyIds);
    cacheRemove(listKey, localOnly);
    removeDetailQueriesById(queryClient, keys.detail.base, localOnlyIds);
  }

  const remaining = rows.filter((row) => !cancelled.has(row.id));
  return remaining.length === 0 ? { kind: 'noop' } : { kind: 'run', vars: toVars(remaining) };
}
