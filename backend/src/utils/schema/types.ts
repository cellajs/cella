/**
 * Manually defined types for common response schemas.
 * These are separate from schema inference to avoid circular dependencies with mock generators.
 */

/** SuccessWithRejectedItems response type */
export interface SuccessWithRejectedItemsResponse {
  success: boolean;
  rejectedItems: string[];
}
