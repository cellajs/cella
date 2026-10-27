import * as oauth from 'oauth4webapi';

/** How long a provider or federation may take to answer one request: the browser waits on the redirect meanwhile. */
const providerTimeoutMs = 10_000;

/** The abort signal of one request to a provider or federation: past the deadline the request rejects with a `TimeoutError`. */
export const providerDeadline = () => AbortSignal.timeout(providerTimeoutMs);

interface AuthorizationUrlParams {
  clientId: string;
  redirectUri: string;
  scopes: readonly string[];
  state: string;
  /** Sent as its S256 challenge: the code exchange must present the verifier. */
  codeVerifier?: string;
  /** The value the id_token must echo. */
  nonce?: string;
  loginHint?: string;
}

/** The authorization URL of one code flow round trip, for a social provider and a federation alike. */
export const authorizationUrl = async (
  endpoint: string,
  { clientId, redirectUri, scopes, state, codeVerifier, nonce, loginHint }: AuthorizationUrlParams,
) => {
  const url = new URL(endpoint);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('state', state);
  if (codeVerifier) {
    url.searchParams.set('code_challenge', await oauth.calculatePKCECodeChallenge(codeVerifier));
    url.searchParams.set('code_challenge_method', 'S256');
  }
  if (nonce) url.searchParams.set('nonce', nonce);
  if (loginHint) url.searchParams.set('login_hint', loginHint);
  return url;
};

/**
 * Whether oauth4webapi refused what the provider or federation answered: the code was rejected, or the response or
 * its tokens failed verification. Both clients answer it 401 `invalid_credentials`; any other error is a fault on this
 * side.
 */
export const isProviderRefusal = (error: unknown): error is Error =>
  error instanceof oauth.ResponseBodyError ||
  error instanceof oauth.AuthorizationResponseError ||
  error instanceof oauth.WWWAuthenticateChallengeError ||
  error instanceof oauth.OperationProcessingError;
