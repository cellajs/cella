import { z } from 'zod';
import { passwordSchema } from '#/utils/schema/common-schemas';
import { userSchema } from '../users/schema';

export const emailBodySchema = z.object({
  email: userSchema.shape.email.transform((email) => email.toLowerCase()),
});

export const authBodySchema = z.object({
  ...emailBodySchema.shape,
  password: passwordSchema,
  token: z.string().optional(),
});

export const passkeyCreationBodySchema = z.object({
  attestationObject: z.string(),
  clientDataJSON: z.string(),
  userEmail: z.string().transform((email) => email.toLowerCase()),
});

export const passkeyVerificationBodySchema = z.object({
  clientDataJSON: z.string(),
  authenticatorData: z.string(),
  signature: z.string(),
  userEmail: z.string().transform((email) => email.toLowerCase()),
});

export const signInResponse = z.object({
  emailVerified: z.boolean(),
});

export const passkeyChallengeQuerySchema = z.object({ challengeBase64: z.string() });
