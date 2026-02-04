import { z } from '@hono/zod-openapi';

/**
 * Zod schema for ActivityError (dead letter error info).
 * Used for failed CDC activities stored for later inspection and replay.
 */
export const activityErrorSchema = z
  .object({
    /** PostgreSQL LSN for idempotency on replay */
    lsn: z.string(),
    message: z.string(),
    /** PostgreSQL error code if available */
    code: z.string().nullable().optional(),
    retryCount: z.number(),
    /** Whether this dead letter has been resolved/replayed */
    resolved: z.boolean().optional(),
  })
  .openapi('ActivityError', {
    description: 'Error info for failed CDC activities (dead letters)',
    example: {
      lsn: '0/16B3A40',
      message: 'Connection timeout during processing',
      code: null,
      retryCount: 3,
      resolved: false,
    },
  });

export type ActivityError = z.infer<typeof activityErrorSchema>;
