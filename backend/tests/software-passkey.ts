import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';
import { appConfig } from 'shared';

/** The relying party ID the backend verifies against (`passkeys/helpers/passkey.ts`). */
const appRpId = appConfig.mode === 'development' ? 'localhost' : appConfig.domain;

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest();

interface AssertOptions {
  origin?: string;
  rpId?: string;
  /** Authenticator flags: 0x01 user present, 0x04 user verified. Default both. */
  flags?: number;
  counter?: number;
}

type CborValue = Parameters<typeof isoCBOR.encode>[0];

/**
 * A software WebAuthn authenticator with a P-256 key: `publicKey` is stored like a registered passkey (COSE,
 * base64url), `assert` signs an authentication response for a challenge, and `attest` answers a registration challenge
 * with a `none` attestation, each valid unless an option says otherwise. `credentialId` defaults to random bytes; an
 * authenticator may claim any id, so a test can pass one another account already registered.
 */
export function softwarePasskey({ credentialId = randomBytes(16).toString('base64url') } = {}) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const { x, y } = publicKey.export({ format: 'jwk' });
  if (!x || !y) throw new Error('software passkey: P-256 key without coordinates');
  // COSE_Key: kty EC2 (1: 2), alg ES256 (3: -7), crv P-256 (-1: 1), x (-2), y (-3).
  const cose = isoCBOR.encode(
    new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, new Uint8Array(Buffer.from(x, 'base64url'))],
      [-3, new Uint8Array(Buffer.from(y, 'base64url'))],
    ]),
  );
  const assert = (challenge: string, options: AssertOptions = {}) => {
    const { origin = appConfig.frontendUrl, rpId = appRpId, flags = 0x05, counter = 1 } = options;
    const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin, crossOrigin: false }));
    const counterBytes = Buffer.alloc(4);
    counterBytes.writeUInt32BE(counter);
    const authenticatorData = Buffer.concat([sha256(rpId), Buffer.from([flags]), counterBytes]);
    // ES256 signs authenticatorData || SHA-256(clientDataJSON); node emits the DER form WebAuthn expects.
    const signature = sign('sha256', Buffer.concat([authenticatorData, sha256(clientDataJSON)]), privateKey);
    return {
      id: credentialId,
      rawId: credentialId,
      response: {
        clientDataJSON: clientDataJSON.toString('base64url'),
        authenticatorData: authenticatorData.toString('base64url'),
        signature: signature.toString('base64url'),
      },
      clientExtensionResults: {},
      type: 'public-key' as const,
    };
  };

  const attest = (challenge: string, options: Omit<AssertOptions, 'counter'> = {}) => {
    // Flags: user present, user verified, attested credential data included.
    const { origin = appConfig.frontendUrl, rpId = appRpId, flags = 0x45 } = options;
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: 'webauthn.create', challenge, origin, crossOrigin: false }),
    );
    const idBytes = Buffer.from(credentialId, 'base64url');
    const idLength = Buffer.alloc(2);
    idLength.writeUInt16BE(idBytes.length);
    // rpIdHash | flags | counter | AAGUID (zeros) | credential id length | credential id | COSE public key
    const authenticatorData = Buffer.concat([
      sha256(rpId),
      Buffer.from([flags]),
      Buffer.alloc(4),
      Buffer.alloc(16),
      idLength,
      idBytes,
      Buffer.from(cose),
    ]);
    const attestationObject = isoCBOR.encode(
      new Map<string, CborValue>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', new Uint8Array(authenticatorData)],
      ]),
    );
    return {
      id: credentialId,
      rawId: credentialId,
      response: {
        clientDataJSON: clientDataJSON.toString('base64url'),
        attestationObject: Buffer.from(attestationObject).toString('base64url'),
        transports: ['internal'],
      },
      clientExtensionResults: {},
      type: 'public-key' as const,
    };
  };

  return { credentialId, publicKey: Buffer.from(cose).toString('base64url'), assert, attest };
}
