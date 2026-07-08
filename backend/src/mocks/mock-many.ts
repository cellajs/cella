/**
 * Generates an array of mock items using the provided generator.
 * Useful for batch generating test data or seed data.
 *
 * @param generator - A function that generates a single mock item.
 * @param count - The number of items to generate (default: 10).
 * @returns An array of mock items.
 */
export const mockMany = <T>(generator: () => T, count = 10): T[] => {
  return Array.from({ length: count }, generator);
};
