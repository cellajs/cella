/** Newest-first ordering on publishedAt when the draft lifecycle set one, else createdAt: the same key unseen tracking uses. */
export function selectRecentActivity<T extends { createdAt?: string | null; publishedAt?: string | null }>(
  items: T[],
  limit: number,
): T[] {
  const recencyOf = (item: T) => Date.parse(item.publishedAt ?? item.createdAt ?? '') || 0;
  return [...items].sort((a, b) => recencyOf(b) - recencyOf(a)).slice(0, limit);
}
