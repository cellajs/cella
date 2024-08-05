import { sign } from 'hono/jwt';
import { env } from '../../env';
import { createHash, createVerify } from 'node:crypto';
import cbor from 'cbor';
import { config } from 'config';
import * as jose from 'jose';
import type { KeyLike } from 'jose';

interface GenerateTokenOptions {
  userId: string;
}

/**
 * Generates a JWT token for Electric. Expires in 1 day.
 *
 * @param {string} userId - The user ID to include in the token.
 * @returns {Promise<string>} - A promise that resolves to the generated JWT token.
 */
export const generateElectricJWTToken = async ({ userId }: GenerateTokenOptions): Promise<string> => {
  return await sign(
    {
      iat: Math.floor(Date.now() / 1000),
      iss: 'cella_backend',
      aud: 'cella_client',
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // Token expires in 1 day
      sub: userId,
    },
    env.ELECTRIC_PRIVATE_KEY_ES256,
    'ES256',
  );
};

export const base64UrlDecode = (base64urlStr: string) => {
  let base64String = base64urlStr.replace(/-/g, '+').replace(/_/g, '/');
  while (base64String.length % 4 !== 0) {
    base64String += '=';
  }
  return Buffer.from(base64String, 'base64');
};

export const parseAndValidatePasskeyAttestation = (clientDataJSON: string, attestationObject: string, challengeFromCookie: string | undefined) => {
  const clientData = JSON.parse(Buffer.from(base64UrlDecode(clientDataJSON)).toString());

  // Compare the challenge
  if (clientData.challenge !== challengeFromCookie) throw new Error('Invalid challenge');

  const attestation = cbor.decode(base64UrlDecode(attestationObject));
  // Validate the attestation statement format (should be 'none' in this example)
  if (attestation.fmt !== 'none') throw new Error('Invalid attestation format');

  const authData = attestation.authData;

  // Parse the authenticator data
  const rpIdHash = authData.slice(0, 32);
  const flags = authData[32];
  const userPresent = (flags & 0x01) !== 0;
  const userVerified = (flags & 0x04) !== 0;
  const rpId = config.mode === 'development' ? 'localhost' : config.domain;
  const expectedRpIdHash = createHash('sha256').update(rpId).digest();

  if (!userPresent || !userVerified) throw new Error('User presence or verification failed');
  if (!rpIdHash.equals(expectedRpIdHash)) throw new Error('Invalid RP ID hash');
  const credentialIdLength = (authData[53] << 8) + authData[54];
  const credentialIdBuffer = authData.slice(55, 55 + credentialIdLength);
  const publicKeyBuffer = authData.slice(55 + credentialIdLength);

  // Convert public key buffer to string for db
  const publicKeyString = Buffer.from(publicKeyBuffer).toString('base64url');
  const credentialIdString = Buffer.from(credentialIdBuffer).toString('base64url');

  return {
    publicKey: publicKeyString,
    credentialId: credentialIdString,
  };
};

export const verifyPassKeyPublic = async (passedPublicKey: string, verifyData: Buffer, signature: string) => {
  // Verify the signature
  const publicKeyBuffer = base64UrlDecode(passedPublicKey);
  const publicKey = await coseToPem(publicKeyBuffer);
  const verify = createVerify('SHA256');
  verify.update(verifyData);
  verify.end();
  const signatureBuffer = base64UrlDecode(signature);
  return verify.verify(publicKey, signatureBuffer);
};

const coseToPem = async (coseKeyBuffer: ArrayBuffer) => {
  // Decode COSE key
  const coseKey = cbor.decode(coseKeyBuffer);

  const kty = coseKey.get(1); // Key Type
  const alg = coseKey.get(3); // Algorithm
  const n = coseKey.get(-1); // Modulus
  const e = coseKey.get(-2); // Exponent

  // Check if kty is 3 (RSA)
  if (kty !== 3) throw new Error('Unsupported key type');

  if (!n || !e) throw new Error('Invalid RSA COSE key');

  // Convert to JWK format
  const jwk = {
    kty: 'RSA',
    alg: alg === -257 ? 'RS256' : 'ES256', // it's either -257 or -7
    n: n.toString('base64url'),
    e: e.toString('base64url'),
  };

  // Import JWK and export SPKI
  const key = await jose.importJWK(jwk, jwk.alg);
  const pemKey = await jose.exportSPKI(key as KeyLike);

  return pemKey;
};
