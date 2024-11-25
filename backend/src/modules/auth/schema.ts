import { z } from 'zod';
import { passwordSchema } from '#/utils/schema/common-schemas';
import { userSchema } from '../users/schema';

export const authBodySchema = z.object({
  email: userSchema.shape.email,
  password: passwordSchema,
  token: z.string().optional(),
});

export const passkeyCreationBodySchema = z.object({
  userEmail: z.string(),
  attestationObject: z.string(),
  clientDataJSON: z.string(),
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

export const passkeyChallengeQuerySchema = z.object({ challengeBase64: z.string() });
