import { z } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import { digestFrequencies } from '#/modules/notification/notification-db';
import { notificationTypes } from '#/modules/notification/notification-types';
import { booleanTransformSchema, integerQuerySchema, translatedError, validIdSchema } from '#/schemas';
import { nullableUserMinimalBaseSchema } from '#/schemas/minimal-base';

export const notificationSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  type: z.enum(notificationTypes),
  entityType: z.enum(appConfig.productEntityTypes),
  subjectId: z.string(),
  contextId: z.string().nullable(),
  channelId: z.string(),
  channelType: z.enum(appConfig.channelEntityTypes),
  organizationId: z.string(),
  // Route params accept ids in place of slugs (beforeLoad rewrites), so `tenantId`, `organizationId` and `channelId`
  // deep-link without resolving slugs first.
  tenantId: z.string(),
  actorId: z.string().nullable(),
  /** Who caused it, for the card's avatar and sentence; null when the actor is no user or the user is gone. */
  actor: nullableUserMinimalBaseSchema,
  /** Display names for the card's sentence; empty when the subject is gone or the user may not read it. */
  channelName: z.string(),
  /** The context's name, as the digest names it: the thread for a comment or reply, else the subject's own. */
  subjectTitle: z.string(),
  readAt: z.string().nullable(),
});

export const notificationListQuerySchema = z.object({
  unread: booleanTransformSchema.describe('Return only unread notifications'),
  limit: integerQuerySchema({ min: 1, max: 100, error: translatedError('error:invalid_limit', { max: 100 }) }).default(30),
  before: z.iso.datetime().optional().describe('createdAt of the last row of the previous page'),
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
