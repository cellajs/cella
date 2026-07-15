import type { DbContext } from '#/core/context';
import { getOrgEntityCount } from '#/modules/entities/entities-queries';

/**
 * Decide where a product-entity list op's `total` comes from, and run the items query
 * alongside it. Every product list faces the same three cases:
 *
 * 1. **Delta/sync read** (`seqCursor` present) — the client discards `total` entirely
 *    (`cache-ops.ts` reads only `items`), so we skip the second query and report the
 *    page length. This removes the `COUNT(*)` that the SSE fan-out stampede pays for on
 *    every subscriber (see `.todos/SYNC_FANOUT_OPTIMIZATION.md`).
 * 2. **Default org-wide list** (`counterEligible`) — the WHERE clause reduces to exactly
 *    "this channel's live rows", so the pre-computed `e:{entityType}` channel counter
 *    equals the total. An O(1) primary-key lookup on `channel_counters` replaces an O(n)
 *    `COUNT(*)` scan. Trade-off: the counter is CDC-maintained, so the total is
 *    eventually consistent (bounded by CDC lag) rather than read-time exact — acceptable
 *    for a list total, and delta reads (which need exactness) never take this path.
 * 3. **Filtered / scoped list** — a search (`q`) or a row-conditional read (`read:'own'`)
 *    narrows the set below the counter, so the exact `COUNT(*)` is still required.
 *
 * `counterEligible` must be `true` only when the WHERE clause is exactly the channel scope
 * plus the live-row filter — i.e. `scopeWhere.kind === 'all'`, no search token, and not a
 * delta read. The caller owns that decision because only it knows its filter set.
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
