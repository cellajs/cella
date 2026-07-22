import { decodeIdToken, type OAuth2Tokens } from 'arctic';
import { appConfig, type EnabledOAuthProvider } from 'shared';
import { AppError } from '#/core/error';

/**
 * Binds an OIDC callback to its authorization request, mitigating code injection and replay.
 * The token is decoded without local signature verification because it arrives directly from
 * the provider token endpoint over TLS. Missing expected nonces preserve in-flight flows.
 */
export const validateOidcNonce = (
  tokens: OAuth2Tokens,
  expectedNonce: string | undefined,
  strategy: EnabledOAuthProvider,
): void => {
  if (!expectedNonce) return;

  let claims: { nonce?: unknown };
  try {
    claims = decodeIdToken(tokens.idToken()) as { nonce?: unknown };
  } catch {
    // openid scope is always requested, so a missing/undecodable id_token is anomalous.
    throw new AppError(401, 'invalid_state', 'error', {
      willRedirect: appConfig.mode !== 'test',
      meta: { errorPagePath: '/auth/error', strategy },
    });
  }

  if (claims.nonce !== expectedNonce) {
    throw new AppError(401, 'invalid_state', 'error', {
      willRedirect: appConfig.mode !== 'test',
      meta: { errorPagePath: '/auth/error', strategy },
    });
  }
};
