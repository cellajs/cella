import { z } from '@hono/zod-openapi';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { maxLength, validEmailSchema } from '#/schemas';

const passkeyTypeSchema = z.enum(['authentication', 'mfa']);
const challengeTypeSchema = z.enum([...passkeyTypeSchema.options, 'registration']);

export const passkeySchema = createSelectSchema(passkeysTable).omit({
  credentialId: true,
  publicKey: true,
  counter: true,
});

const transportSchema = z.enum(['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb']);

/** WebAuthn registration response (`RegistrationResponseJSON`); binary fields are base64url strings. */
export const webAuthnAttestationSchema = z.object({
  id: z.string(),
  rawId: z.string(),
  response: z.object({
    clientDataJSON: z.string(),
    attestationObject: z.string(),
    authenticatorData: z.string().optional(),
    transports: z.array(transportSchema).optional(),
    publicKeyAlgorithm: z.number().optional(),
    publicKey: z.string().optional(),
  }),
  authenticatorAttachment: z.enum(['cross-platform', 'platform']).optional(),
  clientExtensionResults: z.unknown().optional(),
  type: z.literal('public-key'),
});

/** WebAuthn authentication response (`AuthenticationResponseJSON`); binary fields are base64url strings. */
export const webAuthnAssertionSchema = z.object({
  id: z.string(),
  rawId: z.string(),
  response: z.object({
    clientDataJSON: z.string(),
    authenticatorData: z.string(),
    signature: z.string(),
    userHandle: z.string().optional(),
  }),
  authenticatorAttachment: z.enum(['cross-platform', 'platform']).optional(),
  clientExtensionResults: z.unknown().optional(),
  type: z.literal('public-key'),
});

export const passkeyCreateBodySchema = z.object({
  attestation: webAuthnAttestationSchema,
  nameOnDevice: z.string().max(maxLength.field),
});

export const passkeyChallengeBodySchema = z.object({
  type: challengeTypeSchema,
  email: validEmailSchema.optional(),
});

export const passkeyChallengeSchema = z.object({ challenge: z.string(), credentialIds: z.array(z.string()) });

export const passkeyVerificationBodySchema = z.object({
  assertion: webAuthnAssertionSchema,
  type: passkeyTypeSchema,
  email: validEmailSchema.optional(),
});
