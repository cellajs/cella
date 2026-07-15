import type { DbContext } from '#/core/context';
import { getOrgEntityCount } from '#/modules/entities/entities-queries';

/**
 * Source a product list's `total` the cheapest correct way: delta reads discard it (page
 * length, no query); an org-wide unfiltered read maps to the O(1) `e:{entityType}` channel
 * counter (CDC-maintained → eventually consistent, fine for a list total); anything narrower
 * needs the exact `COUNT(*)`. `counterEligible` is the caller's — true only when the WHERE
 * is exactly the channel scope + live rows (`scopeWhere.kind === 'all'`, no `q`, not delta).
 */
export interface ResolveListTotalArgs<TItem> {
  ctx: DbContext;
  /** The paginated items query (a lazy Drizzle builder or a Promise). Always executed. */
  itemsQuery: PromiseLike<TItem[]>;
  /** Delta/sync read (`seqCursor` present): the client discards `total`. */
  isDelta: boolean;
  /**
   * The WHERE clause reduces to exactly "this channel's live rows" (org-wide read, no
   * search/filter), so the pre-computed `e:{entityType}` channel counter equals the total.
   */
  counterEligible: boolean;
  /** Channel key whose `e:{entityType}` counter holds the total (org id for org-homed entities). */
  channelKey: string;
  entityType: string;
  /** Exact `COUNT(*)` over the same WHERE, invoked only when neither shortcut applies. */
  exactCount: () => Promise<number>;
}

export async function resolveListTotal<TItem>({
  ctx,
  itemsQuery,
  isDelta,
  counterEligible,
  channelKey,
  entityType,
  exactCount,
}: ResolveListTotalArgs<TItem>): Promise<{ items: TItem[]; total: number }> {
  // Delta/sync reads discard `total`, so skip the second query and report the page length.
  if (isDelta) {
    const items = await itemsQuery;
    return { items, total: items.length };
  }

  // Default org-wide list → O(1) channel-counter lookup; otherwise the exact COUNT(*).
  // Either way it runs in parallel with the items query, preserving the original concurrency.
  const totalSource = counterEligible ? getOrgEntityCount(ctx, channelKey, entityType) : exactCount();
  const [items, total] = await Promise.all([itemsQuery, totalSource]);
  return { items, total };
}
