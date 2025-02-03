import { ECDSAPublicKey, decodePKIXECDSASignature, decodeSEC1PublicKey, p256, verifyECDSASignature } from '@oslojs/crypto/ecdsa';
import { sha256 } from '@oslojs/crypto/sha2';
import { decodeBase64, encodeBase64 } from '@oslojs/encoding';
import {
  AttestationStatementFormat,
  ClientDataType,
  coseAlgorithmES256,
  coseEllipticCurveP256,
  createAssertionSignatureMessage,
  parseAttestationObject,
  parseAuthenticatorData,
  parseClientDataJSON,
} from '@oslojs/webauthn';
import { config } from 'config';

/**
 * Parses and validates passkey attestation data.
 *
 * Verifies attestation statement, relying party ID hash, user presence and verification, credential, algorithm, and challenge.
 * If valid, returns the encoded public key and credential ID.
 *
 * @param clientDataJSON -Client data JSON from the attestation.
 * @param encodedAttestationObject - Base64-encoded attestation object.
 * @param challengeFromCookie - Challenge value from the cookie to validate.
 * @throws Error if some data is invalid.
 * @returns An object with encoded public key and credential ID.
 */
export const parseAndValidatePasskeyAttestation = (
  clientDataJSON: string,
  encodedAttestationObject: string,
  challengeFromCookie: string | undefined,
) => {
  // Converting strings from client to Uint8Arrays
  const decodedClientDataJSON = decodeBase64(clientDataJSON);
  const decodedAttestationObject = decodeBase64(encodedAttestationObject);

  const { attestationStatement, authenticatorData } = parseAttestationObject(decodedAttestationObject);

  if (attestationStatement.format !== AttestationStatementFormat.None) throw new Error('Invalid attestation statement format');
  // Use "localhost" for localhost
  if (!authenticatorData.verifyRelyingPartyIdHash(config.mode === 'development' ? 'localhost' : config.domain)) {
    throw new Error('Invalid relying party ID hash');
  }

  if (!authenticatorData.userPresent || !authenticatorData.userVerified) throw new Error('User must be present and verified');

  if (authenticatorData.credential === null) throw new Error('Missing credential');

  if (authenticatorData.credential.publicKey.algorithm() !== coseAlgorithmES256) throw new Error('Unsupported algorithm');

  // Parse the COSE key as an EC2 key
  // .rsa() for RSA, .okp() for EdDSA, etc
  const cosePublicKey = authenticatorData.credential.publicKey.ec2();
  if (cosePublicKey.curve !== coseEllipticCurveP256) throw new Error('Unsupported algorithm');

  const clientData = parseClientDataJSON(decodedClientDataJSON);
  if (clientData.type !== ClientDataType.Create) {
    throw new Error('Invalid client data type');
  }

  if (encodeBase64(clientData.challenge) !== challengeFromCookie) throw new Error('Invalid challenge');

  // Use "http://localhost:PORT" for localhost
  if (clientData.origin !== config.frontendUrl) throw new Error('Invalid origin');

  if (clientData.crossOrigin !== null && clientData.crossOrigin) throw new Error('Invalid origin');

  // Store the credential ID, algorithm (ES256), and public key with the user's user ID
  const credentialId = authenticatorData.credential.id;
  const publicKey = new ECDSAPublicKey(p256, cosePublicKey.x, cosePublicKey.y).encodeSEC1Uncompressed();

  return {
    publicKey: encodeBase64(publicKey),
    credentialId: encodeBase64(credentialId),
  };
};

/**
 * Verifies a passkey public key signature.
 *
 * Verifies that signature matches public key and client data, ensuring request is valid.
 *
 * @param signature - Base64-encoded signature to verify.
 * @param authenticatorObject - Base64-encoded authenticator object.
 * @param clientDataJSON - Base64-encoded client data JSON.
 * @param publicKey - Base64-encoded public key for verification.
 * @param challengeFromCookie - Challenge value from the cookie to validate.
 * @throws Error if some data is invalid.
 * @returns Boolean indicating whether the signature is valid.
 */
export const verifyPassKeyPublic = async (
  signature: string,
  authenticatorObject: string,
  clientDataJSON: string,
  publicKey: string,
  challengeFromCookie?: string,
) => {
  // Converting strings to Uint8Arrays
  const decodedSignature = decodeBase64(signature);
  const decodedClientDataJSON = decodeBase64(clientDataJSON);
  const decodedAuthenticatorObject = decodeBase64(authenticatorObject);
  const decodedPublicKey = decodeBase64(publicKey);

  const authenticatorData = parseAuthenticatorData(decodedAuthenticatorObject);
  // Use "localhost" for localhost
  if (!authenticatorData.verifyRelyingPartyIdHash(config.mode === 'development' ? 'localhost' : config.domain)) {
    throw new Error('Invalid relying party ID hash');
  }
  if (!authenticatorData.userPresent || !authenticatorData.userVerified) throw new Error('User must be present and verified');

  const clientData = parseClientDataJSON(decodedClientDataJSON);
  if (clientData.type !== ClientDataType.Get) throw new Error('Invalid client data type');

  if (encodeBase64(clientData.challenge) !== challengeFromCookie) throw new Error('Invalid challenge');
  // Use "http://localhost:PORT" for localhost
  if (clientData.origin !== config.frontendUrl) throw new Error('Invalid origin');

  if (clientData.crossOrigin !== null && clientData.crossOrigin) throw new Error('Invalid origin');

  // Decode DER-encoded signature
  const ecdsaSignature = decodePKIXECDSASignature(decodedSignature);
  const ecdsaPublicKey = decodeSEC1PublicKey(p256, decodedPublicKey);
  const hash = sha256(createAssertionSignatureMessage(decodedAuthenticatorObject, decodedClientDataJSON));
  const valid = verifyECDSASignature(ecdsaPublicKey, hash, ecdsaSignature);
  return valid;
};
