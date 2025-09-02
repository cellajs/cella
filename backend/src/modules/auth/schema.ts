import { membershipSchema } from '#/modules/memberships/schema';
import { userSchema } from '#/modules/users/schema';
import { idSchema, passwordSchema } from '#/utils/schema/common';
import { z } from '@hono/zod-openapi';

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

export const passkeyChallengeQuerySchema = z
  .object({
    email: z.string().optional(),
    token: z.string().optional(),
  })
  .refine((data) => (data.email ? !data.token : !!data.token), { message: 'You must provide either email or token, but not both' });

export const passkeyChallengeSchema = z.object({ challengeBase64: z.string(), credentialIds: z.array(z.string()) });

export const passkeyVerificationBodySchema = z
  .object({
    clientDataJSON: z.string(),
    authenticatorData: z.string(),
    signature: z.string(),
    email: z.string().optional(),
    token: z.string().optional(),
  })
  .refine((data) => !!data.email || !!data.token, { message: 'Either email or token must be provided' });

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
