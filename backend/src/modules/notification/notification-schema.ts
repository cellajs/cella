import { z } from '@hono/zod-openapi';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { digestFrequencies, notificationsTable } from '#/modules/notification/notification-db';
import { booleanTransformSchema, integerQuerySchema, translatedError, validIdSchema } from '#/schemas';
import { nullableUserMinimalBaseSchema } from '#/schemas/minimal-base';

// Route params accept ids in place of slugs (beforeLoad rewrites), so `tenantId`, `organizationId` and `channelId`
// deep-link without resolving slugs first.
export const notificationSchema = createSelectSchema(notificationsTable).omit({ userId: true, activityId: true, emailedAt: true }).extend({
  /** Who caused it, for the card's avatar and sentence; null when the actor is no user or the user is gone. */
  actor: nullableUserMinimalBaseSchema,
  /** Display names for the card's sentence; empty when the subject is gone or the user may not read it. */
  channelName: z.string(),
  /** Null with no image, and when the subject is gone or the user may not read it. */
  channelThumbnailUrl: z.string().nullable(),
  /** The organization of the row, which the recipient belongs to, for the card's place. */
  organizationName: z.string(),
  organizationThumbnailUrl: z.string().nullable(),
  /** The context's name, as the digest names it: the thread for a comment or reply, else the subject's own. */
  subjectTitle: z.string(),
});

export const notificationListQuerySchema = z.object({
  unread: booleanTransformSchema.describe('Return only unread notifications'),
  limit: integerQuerySchema({ min: 1, max: 100, error: translatedError('error:invalid_limit', { max: 100 }) }).default(30),
  before: z
    .string()
    .max(64)
    .pipe(z.iso.datetime())
    .openapi({ format: 'date-time' })
    .optional()
    .describe('createdAt of the last row of the previous page'),
});

export const notificationListResponseSchema = z.object({ items: notificationSchema.array(), unreadCount: z.number().int().min(0) });

/** Omitting both marks every unread notification read. */
export const markReadBodySchema = z.object({
  ids: validIdSchema.array().max(200).optional(),
  contextId: validIdSchema.optional().describe('Mark everything sharing one context read'),
});

export const markReadResponseSchema = z.object({ updated: z.number().int().min(0) });

export const preferencesSchema = z.object({ mentionEmail: z.boolean(), commentEmail: z.boolean(), digest: z.enum(digestFrequencies) });

export const updatePreferencesBodySchema = preferencesSchema.partial();
