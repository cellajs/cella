import { compactVerify, createLocalJWKSet, decodeProtectedHeader } from 'jose';
import { readLtiKeySet } from '#/lib/lti-key-set';
import type { LtiConnection } from '#/modules/connections/connections-db';

/**
 * Whether the platform of `connection` signed `token`, with RS256 and a key of the set its configuration named. The
 * set comes through the guarded fetch.
 * @returns False for a signature, algorithm or key that fails.
 * @throws AppError 400 `outbound_request_failed` when the key set cannot be read, and what `guardedFetch` throws.
 */
export const isSignedByPlatform = async (token: string, connection: LtiConnection): Promise<boolean> => {
  const owner = { id: connection.id, jwksUri: connection.config.jwksUri, meta: { connectionId: connection.id } };
  const keySet = await readLtiKeySet(owner, decodeProtectedHeader(token).kid);
  return compactVerify(token, createLocalJWKSet(keySet), { algorithms: ['RS256'] }).then(
    () => true,
    () => false,
  );
};
