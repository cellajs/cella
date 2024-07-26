import { sign } from 'hono/jwt';
import { env } from '../../env';
import base64url from 'base64url';
import { createHash } from 'node:crypto';
import cbor from 'cbor';
import { config } from 'config';

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

export const base64UrlEncode = (arrayBuffer: Uint8Array) => {
  const binaryString = String.fromCharCode.apply(null, Array.from(arrayBuffer));
  return base64url.fromBase64(Buffer.from(binaryString, 'binary').toString('base64'));
};
export const base64UrlDecode = (base64urlStr: string) => {
  const base64Str = base64urlStr.replace(/-/g, '+').replace(/_/g, '/');
  const binaryStr = Buffer.from(base64Str, 'base64').toString('binary');
  return Uint8Array.from(binaryStr.split('').map((char) => char.charCodeAt(0)));
};

export async function extractCredentialData(attestationObjectBase64: string) {
  const attestationObject = base64UrlDecode(attestationObjectBase64);

  // CBOR decode
  const attestation = cbor.decodeFirstSync(Buffer.from(attestationObject));
  const { fmt, authData } = attestation;

  if (fmt !== 'none') throw new Error('Invalid attestation statement format');

  // Parse authenticator data
  const authDataBuf = Buffer.from(authData);
  const rpIdHash = authDataBuf.subarray(0, 32);
  const rpId = config.mode === 'development' ? 'localhost' : config.domain;
  const expectedRpIdHash = createHash('sha256').update(rpId).digest();
  const flags = authDataBuf[32];
  // const counter = authDataBuf.subarray(33, 37);
  if ((flags & 1) !== 1) throw new Error('User not present');
  if (!rpIdHash.equals(expectedRpIdHash)) throw new Error('Invalid RP ID hash');
  if (((flags >> 2) & 1) !== 1) throw new Error('User not verified');

  // Extract credential ID and public key
  const credentialIdLength = authDataBuf.readUInt16BE(53);
  const credentialId = authDataBuf.subarray(55, 55 + credentialIdLength);
  const publicKey = authDataBuf.subarray(55 + credentialIdLength);

  return { credentialId: base64UrlEncode(credentialId), publicKey: base64UrlEncode(publicKey) };
}
