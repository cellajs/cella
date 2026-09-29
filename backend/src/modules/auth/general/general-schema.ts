import { z } from '@hono/zod-openapi';
import { appConfig, roles } from 'shared';
import { linkTokenTypes } from '#/modules/auth/tokens/token-policies';
import { validEmailSchema } from '#/schemas';

/** Token types invokable via a link: the link-carried ones. A cookie-carried token is never opened as a link. */
export const invokableTokenTypes = linkTokenTypes;

export const emailBodySchema = z.object({
  email: validEmailSchema,
});
export const tokenWithDataSchema = z.object({
  email: z.email(),
  userId: z.string().optional(),
  inactiveMembershipId: z.string().optional(),
  // What the invitation grants, so a signed-in visitor can confirm it before accepting as their own account.
  invitation: z
    .object({
      entityType: z.enum(appConfig.channelEntityTypes),
      entityName: z.string(),
      role: z.enum(roles.all),
      inviterName: z.string(),
    })
    .optional(),
});
