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
  const base64String = base64url.toBase64(base64urlStr);
  const binaryString = Buffer.from(base64String, 'base64').toString('binary');
  return Uint8Array.from(binaryString.split('').map((char) => char.charCodeAt(0)));
};

export async function extractCredentialData(attestationObjectBase64: string) {
  const attestationObject = base64UrlDecode(attestationObjectBase64);

  // CBOR decode
  const decoded = cbor.decodeFirstSync(attestationObject);

  // Check attestation statement format
  if (decoded.fmt !== 'none') throw new Error('Invalid attestation statement format');

  const authenticatorData = decoded.authData;
  if (authenticatorData.length < 37) throw new Error('Invalid authenticator data length');

  const rpIdHash = authenticatorData.slice(0, 32);
  const rpId = config.mode === 'development' ? 'localhost' : config.domain;
  const expectedRpIdHash = createHash('sha256').update(rpId).digest();

  if (!expectedRpIdHash.equals(rpIdHash)) throw new Error('Invalid relying party ID');
  // Check user presence
  if ((authenticatorData[32] & 0x01) !== 0x01) throw new Error('User not present');
  // Check user verification
  if ((authenticatorData[32] & 0x04) !== 0x04) throw new Error('User not verified');
  // Check if credential data is included
  if ((authenticatorData[32] & 0x40) !== 0x40) throw new Error('Missing credentials');

  // Extract credential ID and public key
  const credentialIdSize = (authenticatorData[53] << 8) | authenticatorData[54];
  if (authenticatorData.length < 55 + credentialIdSize) throw new Error('Invalid authenticator data length for credential ID');

  const credentialId = authenticatorData.slice(55, 55 + credentialIdSize);
  const publicKey = authenticatorData.slice(55 + credentialIdSize);

  return { credentialId: base64UrlEncode(credentialId), publicKey: base64UrlEncode(publicKey) };
}
