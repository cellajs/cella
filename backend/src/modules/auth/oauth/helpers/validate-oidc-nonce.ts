import { decodeIdToken, type OAuth2Tokens } from 'arctic';
import { appConfig, type EnabledOAuthProvider } from 'shared';
import { AppError } from '#/core/error';

/**
 * Defense-in-depth OIDC nonce check for OpenID Connect providers (Google, Microsoft).
 *
 * Binds the authorization request to its callback: the `nonce` we generated at
 * initiation is sent to the provider and echoed back inside the signed `id_token`.
 * Validating it here mitigates authorization-code injection/replay even though we
 * still source profile data from the userinfo endpoint.
 *
 * The `id_token` is decoded (not signature-verified) because it is delivered
 * directly from the provider's token endpoint over TLS, matching arctic's pattern.
 *
 * No-ops when `expectedNonce` is absent, so OAuth flows initiated before this was
 * deployed (cookies without a nonce) continue to work until they expire.
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
