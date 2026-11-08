import { z } from '@hono/zod-openapi';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { maxLength } from '#/schemas';

/** Authenticator data and credential ids are a few hundred bytes; an attestation object carries a certificate chain. */
const webAuthnBlobLength = 16_384;
const base64urlString = z.string().max(maxLength.url);

const passkeyKindSchema = z.enum(['authentication', 'mfa']);
const challengeKindSchema = z.enum([...passkeyKindSchema.options, 'registration']);

export const passkeySchema = createSelectSchema(passkeysTable).omit({ credentialId: true, publicKey: true, counter: true, transports: true });

/** WebAuthn registration response (`RegistrationResponseJSON`); binary fields are base64url strings. */
const webAuthnAttestationSchema = z.object({
  id: base64urlString,
  rawId: base64urlString,
  response: z.object({
    clientDataJSON: base64urlString,
    attestationObject: z.string().max(webAuthnBlobLength),
    authenticatorData: base64urlString.optional(),
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
  id: base64urlString,
  rawId: base64urlString,
  response: z.object({
    clientDataJSON: base64urlString,
    authenticatorData: base64urlString,
    signature: base64urlString,
    userHandle: base64urlString.optional(),
  }),
  authenticatorAttachment: z.enum(['cross-platform', 'platform']).optional(),
  clientExtensionResults: z.unknown().optional(),
  type: z.literal('public-key'),
});
export type WebAuthnAssertion = z.infer<typeof webAuthnAssertionSchema>;

export const passkeyCreateBodySchema = z.object({ attestation: webAuthnAttestationSchema, nameOnDevice: z.string().max(maxLength.field) });

export const passkeyChallengeBodySchema = z.object({ kind: challengeKindSchema });

/** The transports WebAuthn names (§5.8.4). A browser ignores any other, so a challenge offers only these. */
export const passkeyTransportSchema = z.enum(['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb']);
export type PasskeyTransport = z.infer<typeof passkeyTransportSchema>;

/**
 * `credentials` lists the account's passkeys, each with the transports its registration reported (none when it
 * reported none): for an MFA or step-up challenge to allow, for a registration challenge of a signed-in user to
 * exclude. Empty for a sign-in challenge.
 */
export const passkeyChallengeSchema = z.object({
  challenge: z.string(),
  credentials: z.array(z.object({ id: z.string(), transports: z.array(passkeyTransportSchema).optional() })),
});

export const passkeyVerificationBodySchema = z.object({ assertion: webAuthnAssertionSchema, kind: passkeyKindSchema });
