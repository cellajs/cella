import { z } from '@hono/zod-openapi';
import { appConfig, roles } from 'shared';
import { linkTokenTypes } from '#/modules/auth/tokens/token-policies';
import { validEmailSchema } from '#/schemas';

/** Token types invokable via a link: the link-carried ones. A cookie-carried token is never opened as a link. */
export const invokableTokenTypes = linkTokenTypes;

export const emailBodySchema = z.object({ email: validEmailSchema });
/** A federation the generic entrance offers: configured here, with at least one institution connected. */
export const signInFederationSchema = z.object({ key: z.string(), label: z.string() });

export const authHealthSchema = z.object({
  restrictedMode: z.boolean(),
  retryAfter: z.number().optional(),
  federations: z.array(signInFederationSchema).describe('Federations with a connected institution, for the "sign in with your institution" entrance'),
});

export const tokenWithDataSchema = z.object({
  email: z.email(),
  userId: z.string().optional(),
  inactiveMembershipId: z.string().optional(),
  /** The invited organization's active SSO connection, so the invitee is offered their institution first. */
  ssoConnectionId: z.string().optional(),
  // What the invitation grants, so a signed-in visitor can confirm it before accepting as their own account.
  invitation: z
    .object({ entityType: z.enum(appConfig.channelEntityTypes), entityName: z.string(), role: z.enum(roles.all), inviterName: z.string() })
    .optional(),
});
