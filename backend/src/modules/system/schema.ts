import { userSchema } from '#/modules/users/schema';
import { z } from '@hono/zod-openapi';
import { appConfig } from 'config';

export const inviteBodySchema = z.object({
  emails: userSchema.shape.email.array().min(1).max(50),
});

export const preasignedURLQuerySchema = z.object({
  key: z.string(),
  isPublic: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => v === true || v === 'true')
    .default(false),
});

export const sendNewsletterBodySchema = z.object({
  organizationIds: z.array(z.string()),
  roles: z.array(z.enum(appConfig.roles.entityRoles)).min(1, { message: 'Role selection is required' }),
  subject: z.string(),
  content: z.string(),
});

export const sendMatrixMessageBodySchema = z
  .object({
    // msgtype: z.enum(['m.text', 'm.notice', 'm.emote', 'm.image', 'm.audio', 'm.video', 'm.file', 'm.location', 'm.sticker']),
    msgtype: z.enum(['m.text', 'm.notice']),

    // All messages must include a body, it uses as a fallback for the message.
    textMessage: z.string().min(1, 'Message cannot be empty'),

    html: z.string().optional(),
  })
  .refine((data) => (data.html ? ['m.text', 'm.notice'].includes(data.msgtype) : true), {
    message: 'HTML can only be used with msgtype "m.text" or "m.notice"',
  });
