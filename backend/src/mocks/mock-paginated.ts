/** Matches paginationSchema: a last page, `{ results: T[], totalSize: number }`. */
export const mockPaginated = <T>(mockFn: (key: string) => T, count = 2): { results: T[]; totalSize: number } => ({
  results: Array.from({ length: count }, (_, i) => mockFn(`item:${i}`)),
  totalSize: count,
});
