interface BatchResponse<T> {
  results: T[];
  rejectedIds: string[];
  rejectionReasons?: Record<string, string[]>;
}

/** Matches batchResponseSchema: `{ results: T[], rejectedIds: string[] }`. */
export const mockBatchResponse = <T>(mockFn: (key: string) => T, count = 2): BatchResponse<T> => ({
  results: Array.from({ length: count }, (_, i) => mockFn(`batch:${i}`)),
  rejectedIds: [],
});
