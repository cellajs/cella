import { createHash, createVerify } from 'node:crypto';
import cbor from 'cbor';
import { config } from 'config';
import type { KeyLike } from 'jose';
import * as jose from 'jose';

export const base64UrlDecode = (base64urlStr: string) => {
  // Replace URL-safe with standard Base64 characters
  let base64String = base64urlStr.replace(/-/g, '+').replace(/_/g, '/');
  while (base64String.length % 4 !== 0) {
    base64String += '=';
  }
  return Buffer.from(base64String, 'base64');
};

export const parseAndValidatePasskeyAttestation = (clientDataJSON: string, attestationObject: string, challengeFromCookie: string | undefined) => {
  // Parse and decode the client data JSON from base64url format
  const clientData = JSON.parse(Buffer.from(base64UrlDecode(clientDataJSON)).toString());

  if (clientData.challenge !== challengeFromCookie) throw new Error('Invalid challenge');

  // Decode the attestation object, which is CBOR-encoded
  const attestation = cbor.decode(base64UrlDecode(attestationObject));

  // Validate the attestation statement format
  if (attestation.fmt !== 'none') throw new Error('Invalid attestation format');
  const authData = attestation.authData;

  // Parse the authenticator data to extract the RP ID hash, flags, and other details
  const rpIdHash = authData.slice(0, 32); // The first 32 bytes are the RP ID hash
  const flags = authData[32]; // The 33rd byte contains flags related to user presence and verification
  const userPresent = (flags & 0x01) !== 0;
  const userVerified = (flags & 0x04) !== 0;

  const rpId = config.mode === 'development' ? 'localhost' : config.domain;
  const expectedRpIdHash = createHash('sha256').update(rpId).digest();

  if (!userPresent || !userVerified) throw new Error('User presence or verification failed');
  if (!rpIdHash.equals(expectedRpIdHash)) throw new Error('Invalid RP ID hash');

  const credentialIdLength = (authData[53] << 8) + authData[54];

  // Slice out the credential ID and public key from the authenticator data
  const credentialIdBuffer = authData.slice(55, 55 + credentialIdLength);
  const publicKeyBuffer = authData.slice(55 + credentialIdLength);

  // Convert data buffer to a base64url-encoded string for storing in the database
  const publicKeyString = Buffer.from(publicKeyBuffer).toString('base64url');
  const credentialIdString = Buffer.from(credentialIdBuffer).toString('base64url');

  return {
    publicKey: publicKeyString,
    credentialId: credentialIdString,
  };
};

export const verifyPassKeyPublic = async (passedPublicKey: string, verifyData: Buffer, signature: string) => {
  try {
    // Verify the signature
    const publicKeyBuffer = base64UrlDecode(passedPublicKey);
    const publicKey = await coseToPem(publicKeyBuffer);
    const verify = createVerify('SHA256');
    verify.update(verifyData);
    verify.end();
    const signatureBuffer = base64UrlDecode(signature);
    return verify.verify(publicKey, signatureBuffer);
  } catch (err) {
    throw new Error('key conversation failed');
  }
};

const coseToPem = async (coseKeyBuffer: ArrayBuffer) => {
  // Decode the COSE key using CBOR decoding
  const coseKey = cbor.decode(coseKeyBuffer);

  // Extract the keyType and algorithm from the COSE key
  const keyType = coseKey.get(1);
  const algorithm = coseKey.get(3);

  switch (keyType) {
    case 3: {
      // RSA key type
      const n = coseKey.get(-1); // Modulus (n)
      const e = coseKey.get(-2); // Exponent (e)

      if (!n || !e) throw new Error('Invalid RSA COSE key');

      // convert JWK format
      const rsaJwk = {
        kty: 'RSA',
        alg: algorithm === -257 ? 'RS256' : 'ES256', // Determine the algorithm (RS256 or ES256)
        // convert modulus to base64url
        n: Buffer.from(n).toString('base64url'),
        e: Buffer.from(e).toString('base64url'),
      };

      // import the JWK and export it as SPKI format
      const rsaKey = await jose.importJWK(rsaJwk, rsaJwk.alg);
      return await jose.exportSPKI(rsaKey as KeyLike);
    }

    case 2: {
      // EC2 (Elliptic Curve) key type
      const curveNum = coseKey.get(-1);
      // extract coordinates
      const x = coseKey.get(-2);
      const y = coseKey.get(-3);

      if (!curveNum || !x || !y) throw new Error('Invalid EC2 COSE key');

      // Map the numeric curve identifier to the appropriate string for JWK
      const curveMap: Record<number, string> = {
        1: 'P-256', // corresponds to ES256
        2: 'P-384', // corresponds to ES384
        3: 'P-521', // corresponds to ES512
      };

      // convert JWK format
      const ec2Jwk = {
        kty: 'EC',
        alg: algorithm === -7 ? 'ES256' : 'ES512', // Determine the algorithm (ES256 or ES512)
        crv: curveMap[curveNum],
        // Convert coordinates to base64url
        x: Buffer.from(x).toString('base64url'),
        y: Buffer.from(y).toString('base64url'),
      };

      // Import the JWK and export it as SPKI format
      const ec2Key = await jose.importJWK(ec2Jwk, ec2Jwk.alg);
      return await jose.exportSPKI(ec2Key as KeyLike);
    }

    case 1: {
      // OKP (Octet Key Pair) key type
      const crv = coseKey.get(-1); // Curve (crv)
      const x = coseKey.get(-2); // x-coordinate (x)

      if (!crv || !x) throw new Error('Invalid OKP COSE key');

      // convert JWK format
      const okpJwk = {
        kty: 'OKP',
        alg: 'EdDSA', // Algorithm is EdDSA for OKP
        crv: crv,
        x: Buffer.from(x).toString('base64url'),
      };

      // Import the JWK and export it as SPKI format
      const okpKey = await jose.importJWK(okpJwk, okpJwk.alg);
      return await jose.exportSPKI(okpKey as KeyLike);
    }

    default:
      // Throw an error for unsupported key types
      throw new Error(`Unsupported key type: ${keyType}`);
  }
};
