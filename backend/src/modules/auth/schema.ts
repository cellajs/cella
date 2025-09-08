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

const twoFactorTypeSchema = z.union([
  z.literal('login'), // Normal passkey authentication
  z.literal('two_factor'), // Passkey used as 2nd factor in 2FA
]);

const twoFactorBaseSchema = z
  .object({
    type: twoFactorTypeSchema,
    email: z.string().optional(),
  })
  // For login, email must exist
  .refine((data) => (data.type === 'login' ? !!data.email : true), { message: t('2fa_schema_requirement') });

export const passkeyChallengeQuerySchema = z
  .object({
    type: z.union([
      ...twoFactorTypeSchema.def.options,
      z.literal('registrate'), // New literal added
    ]),
    email: z.string().optional(),
  })
  .refine((data) => (data.type === 'login' ? !!data.email : true), { message: t('2fa_schema_requirement') });

export const passkeyChallengeSchema = z.object({ challengeBase64: z.string(), credentialIds: z.array(z.string()) });

export const passkeyVerificationBodySchema = z.object({
  credentialId: z.string(),
  clientDataJSON: z.string(),
  authenticatorData: z.string(),
  signature: z.string(),
  ...twoFactorBaseSchema.shape,
});

export const TotpVerificationBodySchema = z.object({
  code: z.string().regex(new RegExp(`^\\d{${appConfig.totpConfig.digits}}$`), `Code must be exactly ${appConfig.totpConfig.digits} digits`),
});

export const oauthQuerySchema = z
  .object({
    type: z.enum(['auth', 'connect', 'invite', 'verify']),
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
