import type { EntityType } from 'shared';
import type { DbContext } from '#/core/context';
import { getOrgEntityCount } from '#/modules/entities/entities-queries';

/**
 * Sources for a product list's `total`; the caller picks one:
 * - `pageLength`: delta reads discard `total` → report the page, no second query.
 * - `counter`: org-wide unfiltered read (`kind:'all'`, no `q`, not delta) → the O(1)
 *   `e:{entityType}` channel counter (CDC-maintained, eventually consistent; fine here).
 * - `exact`: anything narrower (search / row-scoped) → the exact `COUNT(*)`.
 */
export type ListTotalSource =
  | { kind: 'pageLength' }
  | { kind: 'counter'; ctx: DbContext; channelKey: string; entityType: EntityType }
  | { kind: 'exact'; count: () => Promise<number> };

/**
 * Run `itemsQuery` and resolve `total` from `source`, keeping the count (when any) in
 * parallel with the items query. The delta path skips the second query entirely.
 */
export async function resolveListTotal<TItem>(
  itemsQuery: PromiseLike<TItem[]>,
  source: ListTotalSource,
): Promise<{ items: TItem[]; total: number }> {
  if (source.kind === 'pageLength') {
    const items = await itemsQuery;
    return { items, total: items.length };
  }

  const totalQuery =
    source.kind === 'counter' ? getOrgEntityCount(source.ctx, source.channelKey, source.entityType) : source.count();
  const [items, total] = await Promise.all([itemsQuery, totalQuery]);
  return { items, total };
}
