import { z } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { t } from 'i18next';
import { membershipSchema } from '#/modules/memberships/schema';
import { userSchema } from '#/modules/users/schema';
import { idSchema, passwordSchema } from '#/utils/schema/common';

export const emailBodySchema = z.object({
  email: userSchema.shape.email,
});

export const emailPasswordBodySchema = z.object({
  email: userSchema.shape.email,
  password: passwordSchema,
});

export const tokenWithDataSchema = z.object({
  email: z.email(),
  role: z.union([membershipSchema.shape.role, z.null()]),
  userId: idSchema.optional(),
  organizationName: z.string().optional(),
  organizationSlug: z.string().optional(),
  organizationId: z.string().optional(),
});

const passkeyTypeSchema = z.union([z.literal('authentication'), z.literal('mfa')]);
const challengeTypeSchema = z.union([...passkeyTypeSchema.options, z.literal('registration')]);

export const passkeyChallengeQuerySchema = z
  .object({
    type: challengeTypeSchema,
    email: z.string().optional(),
  })
  .refine((data) => (data.type === 'authentication' ? !!data.email : true), { message: t('mfa_schema_requirement') });

export const passkeyChallengeSchema = z.object({ challengeBase64: z.string(), credentialIds: z.array(z.string()) });

export const webAuthnAssertionSchema = z.object({
  credentialId: z.string(),
  clientDataJSON: z.string(),
  authenticatorData: z.string(),
  signature: z.string(),
});

export const passkeyVerificationBodySchema = z.object({
  ...webAuthnAssertionSchema.shape,
  type: passkeyTypeSchema,
  email: z.string().optional(),
});

export const totpVerificationBodySchema = z.object({
  code: z.string().regex(new RegExp(`^\\d{${appConfig.totpConfig.digits}}$`), `Code must be exactly ${appConfig.totpConfig.digits} digits`),
});

export const oauthQuerySchema = z
  .object({
    type: z.enum(['auth', 'connect', 'invite', 'verify']),
    authFlow: z.enum(['signin', 'signup']).optional(),
    redirect: z.string().optional(),
    connect: z.string().optional(),
    token: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.type === 'connect') return !!data.connect;
      if (data.type === 'invite') return !!data.token;
      return true; // No extra requirements for signIn & signUp
    },
    { message: "Missing required field based on 'type'" },
  );

export const oauthCallbackQuerySchema = z.object({
  code: z.string(),
  state: z.string(),
});
