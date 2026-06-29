/**
 * Wraps a mock generator to produce a paginated response.
 * Matches the paginationSchema structure: { items: T[], total: number }
 *
 * @param mockFn - Mock generator function (optionally takes a seed key)
 * @param count - Number of items to generate (default: 2)
 */
export const mockPaginated = <T>(mockFn: (key?: string) => T, count = 2): { items: T[]; total: number } => ({
  items: Array.from({ length: count }, (_, i) => mockFn(`item:${i}`)),
  total: count,
});
