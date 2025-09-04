import { membershipSchema } from '#/modules/memberships/schema';
import { userSchema } from '#/modules/users/schema';
import { idSchema, passwordSchema } from '#/utils/schema/common';
import { z } from '@hono/zod-openapi';
import { appConfig } from 'config';

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

const passkeyTypeSchema = z.union([
  z.literal('registrate'), // User registrating a new passkey
  z.literal('login'), // Normal passkey authentication
  z.literal('two_factor'), // Passkey used as 2nd factor in 2FA
]);

export const passkeyBaseInfoSchema = z
  .object({
    type: passkeyTypeSchema,
    email: z.string().optional(),
  })
  .refine(
    (data) => {
      // For login, email must exist
      if (data.type === 'login') return !!data.email;

      return true;
    },
    {
      message: 'Email is required for login/registration and must be absent for 2FA',
    },
  );

export const passkeyChallengeSchema = z.object({ challengeBase64: z.string(), credentialIds: z.array(z.string()) });

export const passkeyVerificationBodySchema = z.object({
  clientDataJSON: z.string(),
  authenticatorData: z.string(),
  signature: z.string(),
  ...passkeyBaseInfoSchema.shape,
});

export const TOTPVerificationBodySchema = z.object({
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
