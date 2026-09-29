import { createPrivateKey, createPublicKey, hkdfSync, type KeyObject, sign, verify } from 'node:crypto';
import { z } from 'zod';

// The Yjs auth token scheme: the backend signs with an Ed25519 private key, the relay verifies with the
// public key alone, so neither the relay nor anything it holds can mint a token. Format is
// base64url(JSON payload) + '.' + base64url(the Ed25519 signature over the encoded payload).

const DELIMITER = '.';
const SIGNATURE_BYTES = 64;
/** DER prefix that wraps a raw 32-byte Ed25519 seed as a PKCS#8 private key (RFC 8410). */
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
/** HKDF info label, so the key material yields this signing key and no other. */
const KEY_DERIVATION_INFO = 'yjs-token-ed25519';

export const yjsTokenPayloadSchema = z.object({
  userId: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  tenantId: z.string(),
  organizationId: z.string().nullable(),
  exp: z.number(),
});

export type YjsTokenPayload = z.infer<typeof yjsTokenPayloadSchema>;

/**
 * The reason lets callers log by severity. `expired` is routine and self-healing: the token lapses
 * on a long-lived editor socket and the client reconnects with a fresh one. `bad_signature` and
 * `malformed` mean a mismatched key pair, truncation or tampering.
 */
export type VerifyYjsTokenResult =
  | { ok: true; payload: YjsTokenPayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

/**
 * The Ed25519 signing key for the backend's key material: any string of at least 32 characters, from which the
 * key's seed derives by HKDF-SHA256, so a generated random secret serves as the key.
 */
export function yjsTokenSigningKey(material: string): KeyObject {
  const seed = Buffer.from(hkdfSync('sha256', material, '', KEY_DERIVATION_INFO, 32));
  return createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: 'der', type: 'pkcs8' });
}

/** The public half of {@link yjsTokenSigningKey}, as base64url of its raw 32 bytes: the value the relay is given. */
export function yjsTokenPublicKey(material: string): string {
  const { x } = createPublicKey(yjsTokenSigningKey(material)).export({ format: 'jwk' });
  if (!x) throw new Error('Ed25519 public key export carried no key bytes');
  return x;
}

/** The verification key from its base64url raw form; throws for a value that is not an Ed25519 public key. */
export function yjsTokenVerifyKey(publicKey: string): KeyObject {
  return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: publicKey }, format: 'jwk' });
}

/**
 * The token names the one entity the user may edit and its tenant scope, so the relay verifies
 * access locally with no call back to the backend.
 */
export function signYjsToken(params: Omit<YjsTokenPayload, 'exp'>, signingKey: KeyObject, ttlMs: number): string {
  const payload: YjsTokenPayload = {
    ...params,
    exp: Date.now() + ttlMs,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = sign(null, Buffer.from(payloadB64), signingKey).toString('base64url');
  return `${payloadB64}${DELIMITER}${signature}`;
}

/** Verify and decode a Yjs token signed by {@link signYjsToken}, with the public key only. */
export function verifyYjsToken(token: string, verifyKey: KeyObject): VerifyYjsTokenResult {
  const delimiterIndex = token.lastIndexOf(DELIMITER);
  if (delimiterIndex === -1) return { ok: false, reason: 'malformed' };

  const payloadB64 = token.slice(0, delimiterIndex);
  const signature = Buffer.from(token.slice(delimiterIndex + 1), 'base64url');
  if (signature.length !== SIGNATURE_BYTES) return { ok: false, reason: 'bad_signature' };
  if (!verify(null, Buffer.from(payloadB64), verifyKey, signature)) return { ok: false, reason: 'bad_signature' };

  let payload: YjsTokenPayload;
  try {
    const raw = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    payload = yjsTokenPayloadSchema.parse(raw);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (Date.now() > payload.exp) return { ok: false, reason: 'expired' };
  return { ok: true, payload };
}
