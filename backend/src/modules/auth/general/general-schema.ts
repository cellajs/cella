import { z } from '@hono/zod-openapi';
import { appConfig, roles } from 'shared';
import { federationRefSchema } from '#/modules/auth/sso/sso-schema';
import { validEmailSchema } from '#/schemas';

export const emailBodySchema = z.object({ email: validEmailSchema });

export const authHealthSchema = z.object({
  restrictedMode: z.boolean(),
  retryAfter: z.number().optional(),
  // A federation the generic entrance offers: configured here, with at least one institution connected.
  federations: z.array(federationRefSchema).describe('Federations with a connected institution, for the "sign in with your institution" entrance'),
  emailEnabled: z.boolean().describe('Whether the server has an email key: without one no email goes out'),
});

export const tokenWithDataSchema = z.object({
  email: z.email(),
  userId: z.string().optional(),
  invitationId: z.string().optional(),
  /** The invited organization's active SSO connection, so the invitee is offered their institution first. */
  ssoConnectionId: z.string().optional(),
  inviterName: z.string().optional().describe('Name of the user who sent an invitation, for a system invitation too'),
  /** What the invitation grants, so a signed-in visitor can confirm it before accepting as their own account. */
  invitation: z
    .object({
      entityType: z.enum(appConfig.channelEntityTypes),
      /** Where the channel is, so an accept opens it through the notification link. */
      tenantId: z.string(),
      organizationId: z.string(),
      channelId: z.string(),
      entityName: z.string(),
      /** The organization of a channel below it; absent for an organization. */
      organizationName: z.string().optional(),
      role: z.enum(roles.all),
      inviterName: z.string(),
    })
    .optional(),
});
