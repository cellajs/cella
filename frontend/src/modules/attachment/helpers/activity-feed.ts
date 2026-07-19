/**
 * Newest-first recency ordering for activity feeds: publish time when the draft lifecycle set
 * one, else create time; the same key unseen tracking uses. Pure, so forks can reuse it over
 * any product entity type.
 */
export function selectRecentActivity<T extends { createdAt?: string | null; publishedAt?: string | null }>(
  items: T[],
  limit: number,
): T[] {
  const recencyOf = (item: T) => Date.parse(item.publishedAt ?? item.createdAt ?? '') || 0;
  return [...items].sort((a, b) => recencyOf(b) - recencyOf(a)).slice(0, limit);
}
