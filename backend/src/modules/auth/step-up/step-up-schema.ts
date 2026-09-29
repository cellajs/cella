import { z } from '@hono/zod-openapi';
import { webAuthnAssertionSchema } from '#/modules/auth/passkeys/passkeys-schema';
import { stepUpMethods } from '#/modules/auth/step-up/helpers/step-up';
import { totpCreateBodySchema } from '#/modules/auth/totps/totps-schema';

export const stepUpStateSchema = z.object({
  steppedUp: z
    .boolean()
    .openapi({ description: 'The session proved its user presence recently enough for account-security actions.' }),
  methods: z
    .array(z.enum(stepUpMethods))
    .openapi({ description: 'What the user can offer to step up; empty while impersonating.' }),
});

/** One second-factor proof: a passkey assertion to a step-up passkey challenge, or a current TOTP code. */
export const stepUpBodySchema = z.object({
  passkeyData: webAuthnAssertionSchema.optional(),
  totpCode: totpCreateBodySchema.shape.code.optional(),
});

export const stepUpLinkBodySchema = z.object({
  /** The app path to return to after the link is opened. */
  redirect: z.string().optional(),
});
