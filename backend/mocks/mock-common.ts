/**
 * Mock generators for common response schemas (not entity-specific).
 * Used for DB seeding, tests, and API response examples.
 */

import type { SuccessWithRejectedItemsResponse } from '#/utils/schema/types';
import { registerExample } from './example-registry';

/**
 * Generates a mock SuccessWithRejectedItems response.
 * Used by batch delete endpoints.
 */
export const mockSuccessWithRejectedItems = (): SuccessWithRejectedItemsResponse => ({
  success: true,
  rejectedItems: [],
});

/**
 * Generates an array of mock records using the provided generator.
 * Useful for batch generating test data or seed data.
 *
 * @param generator - A function that generates a single mock record.
 * @param count - The number of records to generate (default: 10).
 * @returns An array of mock records.
 */
export const mockMany = <T>(generator: () => T, count = 10): T[] => {
  return Array.from({ length: count }, generator);
};

// Self-register for OpenAPI examples
registerExample('SuccessWithRejectedItems', mockSuccessWithRejectedItems);