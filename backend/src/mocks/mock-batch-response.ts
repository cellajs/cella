/**
 * Generic batch response type matching batchResponseSchema.
 */
export interface BatchResponse<T> {
  data: T[];
  rejectedIds: string[];
  rejectionReasons?: Record<string, string[]>;
}

/**
 * Wraps a mock generator to produce a batch response matching batchResponseSchema
 * (`{ data: T[], rejectedIds: string[] }`). `count` defaults to 2.
 */
export const mockBatchResponse = <T>(mockFn: (key: string) => T, count = 2): BatchResponse<T> => ({
  data: Array.from({ length: count }, (_, i) => mockFn(`batch:${i}`)),
  rejectedIds: [],
});
