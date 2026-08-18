export interface BatchResponse<T> {
  data: T[];
  rejectedIds: string[];
  rejectionReasons?: Record<string, string[]>;
}

/** Matches batchResponseSchema: `{ data: T[], rejectedIds: string[] }`. */
export const mockBatchResponse = <T>(mockFn: (key: string) => T, count = 2): BatchResponse<T> => ({
  data: Array.from({ length: count }, (_, i) => mockFn(`batch:${i}`)),
  rejectedIds: [],
});
