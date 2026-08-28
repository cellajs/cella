import { z } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import { validIdSchema } from '#/schemas';
import { digestFrequencies, notificationTypes } from './notification-db';

export const notificationSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  type: z.enum(notificationTypes),
  entityType: z.enum(appConfig.productEntityTypes),
  subjectId: z.string(),
  contextId: z.string().nullable(),
  channelId: z.string(),
  channelType: z.string(),
  organizationId: z.string(),
  // Route params accept ids in place of slugs (beforeLoad rewrites), so these three are all the
  // client needs to deep-link without resolving slugs first.
  tenantId: z.string(),
  actorId: z.string().nullable(),
  readAt: z.string().nullable(),
});

export const notificationListQuerySchema = z.object({
  unread: z.enum(['true', 'false']).optional().describe('Return only unread notifications'),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  before: z.string().optional().describe('createdAt of the last row of the previous page'),
});

export const notificationListResponseSchema = z.object({
  items: notificationSchema.array(),
  unreadCount: z.number().int().min(0),
});

/** Omitting both marks every unread notification read. */
export const markReadBodySchema = z.object({
  ids: validIdSchema.array().max(200).optional(),
  contextId: validIdSchema.optional().describe('Mark everything sharing one context read'),
});

export const markReadResponseSchema = z.object({
  updated: z.number().int().min(0),
});

export const preferencesSchema = z.object({
  mentionEmail: z.boolean(),
  commentEmail: z.boolean(),
  digest: z.enum(digestFrequencies),
});

export const updatePreferencesBodySchema = preferencesSchema.partial();
