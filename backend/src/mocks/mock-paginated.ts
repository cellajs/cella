/** Matches paginationSchema: `{ items: T[], total: number }`. */
export const mockPaginated = <T>(
  mockFn: (key?: string) => T,
  count = 2,
  total = count,
): { items: T[]; total: number } => ({
  items: Array.from({ length: count }, (_, i) => mockFn(`item:${i}`)),
  total,
});
