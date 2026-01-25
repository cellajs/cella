/**
 * Mock generators for common response schemas (not entity-specific).
 * Used for DB seeding, tests, and API response examples.
 */

import type { SuccessWithRejectedItemsResponse } from '#/schemas';

/**
 * Generates a mock SuccessWithRejectedItems response.
 * Used by batch delete endpoints.
 */
export const mockSuccessWithRejectedItems = (): SuccessWithRejectedItemsResponse => ({
  success: true,
  rejectedItemIds: [],
});
