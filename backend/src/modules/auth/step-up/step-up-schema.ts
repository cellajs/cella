import { z } from '@hono/zod-openapi';
import { webAuthnAssertionSchema } from '#/modules/auth/passkeys/passkeys-schema';
import { stepUpMethods, stepUpTiers } from '#/modules/auth/step-up/helpers/step-up';
import { totpCreateBodySchema } from '#/modules/auth/totps/totps-schema';

export const stepUpQuerySchema = z.object({
  tier: z
    .enum(stepUpTiers)
    .default('account')
    .describe(
      'The kind of action asked about: `factor` hands out lasting access, `account` changes or ends the account, `enroll` sets up a second factor.',
    ),
});

export const stepUpStateSchema = z.object({
  steppedUp: z.boolean().describe('The session proved its user present recently enough for the tier.'),
  methods: z.array(z.enum(stepUpMethods)).describe('What the user can offer to step up for the tier; empty while impersonating.'),
});

/**
 * One proof: a passkey assertion to a step-up passkey challenge, a current TOTP code, or the code a step-up mail
 * carries, which has the authenticator code's format.
 */
export const stepUpBodySchema = z.object({
  passkeyData: webAuthnAssertionSchema.optional(),
  totpCode: totpCreateBodySchema.shape.code.optional(),
  emailCode: totpCreateBodySchema.shape.code.optional(),
});
