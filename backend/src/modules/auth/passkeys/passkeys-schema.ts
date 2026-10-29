import { z } from '@hono/zod-openapi';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { maxLength } from '#/schemas';

/** Authenticator data and credential ids are a few hundred bytes; an attestation object carries a certificate chain. */
const webAuthnBlobLength = 16_384;

const passkeyTypeSchema = z.enum(['authentication', 'mfa']);
const challengeTypeSchema = z.enum([...passkeyTypeSchema.options, 'registration']);

export const passkeySchema = createSelectSchema(passkeysTable).omit({ credentialId: true, publicKey: true, counter: true });

/** WebAuthn registration response (`RegistrationResponseJSON`); binary fields are base64url strings. */
const webAuthnAttestationSchema = z.object({
  id: z.string().max(maxLength.url),
  rawId: z.string().max(maxLength.url),
  response: z.object({
    clientDataJSON: z.string().max(maxLength.url),
    attestationObject: z.string().max(webAuthnBlobLength),
    authenticatorData: z.string().max(maxLength.url).optional(),
    /** Open string set: the spec lets authenticators report transports the enum has not caught up with. */
    transports: z.array(z.string().max(maxLength.field)).max(10).optional(),
    publicKeyAlgorithm: z.number().optional(),
    publicKey: z.string().max(webAuthnBlobLength).optional(),
  }),
  authenticatorAttachment: z.enum(['cross-platform', 'platform']).optional(),
  clientExtensionResults: z.unknown().optional(),
  type: z.literal('public-key'),
});
export type WebAuthnAttestation = z.infer<typeof webAuthnAttestationSchema>;

/** WebAuthn authentication response (`AuthenticationResponseJSON`); binary fields are base64url strings. */
export const webAuthnAssertionSchema = z.object({
  id: z.string().max(maxLength.url),
  rawId: z.string().max(maxLength.url),
  response: z.object({
    clientDataJSON: z.string().max(maxLength.url),
    authenticatorData: z.string().max(maxLength.url),
    signature: z.string().max(maxLength.url),
    userHandle: z.string().max(maxLength.url).optional(),
  }),
  authenticatorAttachment: z.enum(['cross-platform', 'platform']).optional(),
  clientExtensionResults: z.unknown().optional(),
  type: z.literal('public-key'),
});
export type WebAuthnAssertion = z.infer<typeof webAuthnAssertionSchema>;

export const passkeyCreateBodySchema = z.object({ attestation: webAuthnAttestationSchema, nameOnDevice: z.string().max(maxLength.field) });

export const passkeyChallengeBodySchema = z.object({ type: challengeTypeSchema });

/** `credentialIds` lists the account's passkeys for an MFA or step-up challenge; empty for a sign-in or registration challenge. */
export const passkeyChallengeSchema = z.object({ challenge: z.string(), credentialIds: z.array(z.string()) });

export const passkeyVerificationBodySchema = z.object({ assertion: webAuthnAssertionSchema, type: passkeyTypeSchema });
