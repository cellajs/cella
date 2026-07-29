/**
 * Sources for a paginated list's `total`:
 * - `pageLength`: callers do not need a collection total, so report the fetched page length.
 * - `counter`: resolve an eventually consistent precomputed total.
 * - `exact`: resolve an exact `COUNT(*)`.
 */
export type ListTotalSource = { kind: 'pageLength' } | { kind: 'counter' | 'exact'; getTotal: () => Promise<number> };

export interface PaginatedResult<TItem> {
  items: TItem[];
  total: number;
}

/**
 * Run an items query and its total source in parallel. Page-length reads skip the
 * total source entirely.
 */
export async function resolveListTotal<TItem>(
  itemsQuery: PromiseLike<TItem[]>,
  source: ListTotalSource,
): Promise<PaginatedResult<TItem>> {
  if (source.kind === 'pageLength') {
    const items = await itemsQuery;
    return { items, total: items.length };
  }

  const totalQuery = source.getTotal();
  const [items, total] = await Promise.all([itemsQuery, totalQuery]);
  return { items, total };
}
