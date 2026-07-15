/**
 * Wraps a mock generator to produce a paginated response matching paginationSchema
 * (`{ items: T[], total: number }`). `count` defaults to 2.
 */
export const mockPaginated = <T>(mockFn: (key?: string) => T, count = 2): { items: T[]; total: number } => ({
  items: Array.from({ length: count }, (_, i) => mockFn(`item:${i}`)),
  total: count,
});
