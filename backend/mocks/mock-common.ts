/**
 * Mock generators for common response schemas (not entity-specific).
 * Used for DB seeding, tests, and API response examples.
 *
 * NOTE: Uses `import type` to avoid circular dependencies with schema files.
 */

import type { BatchResponseEmpty, SuccessWithRejectedItemsResponse } from '#/schemas';

/**
 * @deprecated Use `mockBatchResponseEmpty` instead.
 * Generates a mock SuccessWithRejectedItems response (legacy format).
 */
export const mockSuccessWithRejectedItems = (): SuccessWithRejectedItemsResponse => ({
  success: true,
  rejectedItemIds: [],
});

/**
 * Generates a mock empty batch response for delete operations.
 */
export const mockBatchResponseEmpty = (): BatchResponseEmpty => ({
  data: [],
  rejectedItemIds: [],
});

/**
 * Generic batch response type matching batchResponseSchema.
 */
export interface BatchResponse<T> {
  data: T[];
  rejectedItemIds: string[];
  rejectionReasons?: Record<string, string>;
}

/**
 * Wraps a mock generator to produce a batch response.
 * Matches the batchResponseSchema structure: { data: T[], rejectedItemIds: string[] }
 *
 * @param mockFn - Mock generator function (takes a seed key)
 * @param count - Number of items to generate (default: 2)
 */
export const mockBatchResponse = <T>(mockFn: (key: string) => T, count = 2): BatchResponse<T> => ({
  data: Array.from({ length: count }, (_, i) => mockFn(`batch:${i}`)),
  rejectedItemIds: [],
});
