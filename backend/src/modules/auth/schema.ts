import { z } from 'zod';
import { idSchema, passwordSchema } from '#/utils/schema/common';
import { userSchema } from '../users/schema';

export const emailPasswordBodySchema = z.object({
  email: userSchema.shape.email,
  password: passwordSchema,
});

export const checkTokenSchema = z.object({
  email: z.string().email(),
  userId: idSchema.optional(),
  organizationName: z.string().optional(),
  organizationSlug: z.string().optional(),
  organizationId: z.string().optional(),
});

export const passkeyVerificationBodySchema = z.object({
  clientDataJSON: z.string(),
  authenticatorData: z.string(),
  signature: z.string(),
  userEmail: z.string(),
});

export const emailBodySchema = z.object({
  email: userSchema.shape.email,
});

/** Response schema if successfully signed in */
export const signInSchema = z.object({
  emailVerified: z.boolean(),
});

export const passkeyChallengeQuerySchema = z.object({ challengeBase64: z.string() });

export const oauthQuerySchema = z
  .object({
    type: z.enum(['auth', 'connect', 'invite']),
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
export const sendVerificationEmailBodySchema = z.object({
  tokenId: z.string().optional(),
  userId: z.string().optional(),
});
