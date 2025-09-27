import { z } from '@hono/zod-openapi';
import { createSelectSchema } from 'drizzle-zod';
import { t } from 'i18next';
import { passkeysTable } from '#/db/schema/passkeys';

const passkeyTypeSchema = z.union([z.literal('authentication'), z.literal('mfa')]);
const challengeTypeSchema = z.union([...passkeyTypeSchema.options, z.literal('registration')]);

export const passkeySchema = createSelectSchema(passkeysTable).omit({ credentialId: true, publicKey: true });

export const passkeyCreateBodySchema = z.object({
  attestationObject: z.string(),
  clientDataJSON: z.string(),
  nameOnDevice: z.string(),
});

export const passkeyChallengeBodySchema = z
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
