/**
 * Sources for a paginated list's `total`: `pageLength` reports the fetched page length, `counter`
 * an eventually consistent precomputed total, `exact` a `COUNT(*)`. `getTotal` builds its own query: a drizzle builder
 * changes in place, so one the items query was chained from already holds the page's limit and offset.
 */
export type ListTotalSource = { kind: 'pageLength' } | { kind: 'counter' | 'exact'; getTotal: () => Promise<number> };

interface PaginatedResult<TItem> {
  items: TItem[];
  total: number;
}

/** Runs the items query and the total source in parallel; page-length reads skip the total source. */
export async function resolveListTotal<TItem>(itemsQuery: PromiseLike<TItem[]>, source: ListTotalSource): Promise<PaginatedResult<TItem>> {
  if (source.kind === 'pageLength') {
    const items = await itemsQuery;
    return { items, total: items.length };
  }

  const totalQuery = source.getTotal();
  const [items, total] = await Promise.all([itemsQuery, totalQuery]);
  return { items, total };
}
