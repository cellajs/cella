import { z } from 'zod';
import { type MenuSectionName, menuSections } from '#/entity-config';
import { idSchema, passwordSchema } from '#/utils/schema/common-schemas';
import { menuItemSchema } from '../me/schema';
import { userSchema } from '../users/schema';

export const emailPasswordBodySchema = z.object({
  email: userSchema.shape.email,
  password: passwordSchema,
  token: z.string().optional(),
});

export const checkTokenSchema = z.object({
  email: z.string().email(),
  userId: idSchema.optional(),
  organizationName: z.string().optional(),
  organizationSlug: z.string().optional(),
  organizationId: z.string().optional(),
});

export const passkeyRegistrationBodySchema = z.object({
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

export const signInResponse = z.object({
  emailVerified: z.boolean(),
});

export const passkeyChallengeQuerySchema = z.object({ challengeBase64: z.string() });

const sectionNames = menuSections.map((section) => section.name) as [MenuSectionName];

export const acceptOrgInviteResponseSchema = z
  .object({
    newItem: menuItemSchema,
    sectionName: z.enum(sectionNames),
  })
  .optional();

export const oauthQuerySchema = z.object({
  redirect: z.string().optional(),
  connect: z.boolean().optional(),
  token: z.string().optional(),
});
