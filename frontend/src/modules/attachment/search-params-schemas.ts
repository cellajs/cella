import z from 'zod';

/**
 * Search params schema for attachments route.
 */
export const attachmentsRouteSearchParamsSchema = z.object({
  attachmentDialogId: z.string().optional(),
  groupId: z.string().optional(),
  q: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
  sort: z.enum(['name', 'createdAt', 'contentType']).optional(),
});
