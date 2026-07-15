/**
 * Generates an array of `count` (default 10) mock items via `generator`.
 * Useful for batch test/seed data.
 */
export const mockMany = <T>(generator: () => T, count = 10): T[] => {
  return Array.from({ length: count }, generator);
};
