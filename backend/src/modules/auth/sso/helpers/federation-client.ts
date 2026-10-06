import * as oauth from 'oauth4webapi';
import { AppError } from '#/core/error';
import { log } from '#/utils/logger';
import type { Federation } from './federations';

/** The claims of one sign-in: the verified id_token claims with the userinfo claims over them. */
export type SsoClaims = Record<string, unknown> & { sub: string; iss: string };

/** Tests hand in a fetch that serves the federation's documents and endpoints; production uses the global one. */
export interface FederationClientOptions {
  fetch?: typeof fetch;
}

const fetchOption = (options: FederationClientOptions) => (options.fetch ? { [oauth.customFetch]: options.fetch } : {});

const discovered = new Map<string, Promise<oauth.AuthorizationServer>>();

/**
 * The federation's server metadata from its discovery document, fetched once per process at first use. One object per
 * federation, so oauth4webapi's JWKS cache (keyed on it) applies; forgotten on failure, so the next sign-in rediscovers.
 */
const discoverFederation = async (federation: Federation, options: FederationClientOptions = {}): Promise<oauth.AuthorizationServer> => {
  const pending = discovered.get(federation.key);
  if (pending) return pending;

  const issuer = new URL(federation.issuer);
  const discovery = oauth.discoveryRequest(issuer, fetchOption(options)).then((response) => oauth.processDiscoveryResponse(issuer, response));
  discovery.catch(() => discovered.delete(federation.key));
  discovered.set(federation.key, discovery);
  return discovery;
};

/** Drops the cached discovery of a federation: after a signature failure, or between tests. */
export const forgetFederation = (key: string) => discovered.delete(key);

interface AuthorizationUrlInput {
  state: string;
  codeVerifier: string;
  nonce: string;
  /** The institution's IdP entity ids, comma-separated: one skips the federation's picker, several narrow it. */
  loginHint?: string;
}

/** The federation's authorization URL for one round trip: code flow, PKCE S256, the nonce the id_token must echo. */
export const createFederationAuthorizationUrl = async (
  federation: Federation,
  { state, codeVerifier, nonce, loginHint }: AuthorizationUrlInput,
  options: FederationClientOptions = {},
): Promise<URL> => {
  const as = await discoverFederation(federation, options);
  if (!as.authorization_endpoint) throw new AppError(400, 'oauth_failed', 'error', { meta: { strategy: federation.key } });

  const url = new URL(as.authorization_endpoint);
  url.searchParams.set('client_id', federation.clientId);
  url.searchParams.set('redirect_uri', federation.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', federation.scopes.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', await oauth.calculatePKCECodeChallenge(codeVerifier));
  url.searchParams.set('code_challenge_method', 'S256');
  if (loginHint) url.searchParams.set('login_hint', loginHint);
  return url;
};

interface CodeExchangeInput {
  code: string;
  state: string;
  codeVerifier: string;
  nonce: string;
}

/**
 * Exchanges the callback's code for the sign-in's claims. The id_token is verified in full (signature against the
 * federation's keys, issuer, audience, expiry, the nonce this round trip minted), then userinfo is read with the access
 * token: the federation releases most claims there.
 * @throws AppError 401 `invalid_credentials` when the federation refuses the code or the tokens fail verification.
 */
export const exchangeFederationCode = async (
  federation: Federation,
  { code, state, codeVerifier, nonce }: CodeExchangeInput,
  options: FederationClientOptions = {},
): Promise<SsoClaims> => {
  const as = await discoverFederation(federation, options);
  const client: oauth.Client = { client_id: federation.clientId };
  const clientAuth =
    federation.clientAuthMethod === 'client_secret_post'
      ? oauth.ClientSecretPost(federation.clientSecret)
      : oauth.ClientSecretBasic(federation.clientSecret);

  try {
    const params = oauth.validateAuthResponse(as, client, new URLSearchParams({ code, state }), state);
    const response = await oauth.authorizationCodeGrantRequest(
      as,
      client,
      clientAuth,
      params,
      federation.redirectUri,
      codeVerifier,
      fetchOption(options),
    );
    const tokens = await oauth.processAuthorizationCodeResponse(as, client, response, { requireIdToken: true, expectedNonce: nonce });
    // The signature check: TLS vouches for the token endpoint, the federation's keys for the token itself. Fetched by
    // key id, so a rotation past the cached set refetches.
    await oauth.validateApplicationLevelSignature(as, response, fetchOption(options));

    const idClaims = oauth.getValidatedIdTokenClaims(tokens);
    if (!idClaims) throw new AppError(401, 'invalid_credentials', 'error', { meta: { strategy: federation.key } });

    const userinfoResponse = await oauth.userInfoRequest(as, client, tokens.access_token, fetchOption(options));
    const userinfo = await oauth.processUserInfoResponse(as, client, idClaims.sub, userinfoResponse);

    return { ...idClaims, ...userinfo, sub: idClaims.sub, iss: idClaims.iss };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (
      error instanceof oauth.ResponseBodyError ||
      error instanceof oauth.AuthorizationResponseError ||
      error instanceof oauth.WWWAuthenticateChallengeError ||
      error instanceof oauth.OperationProcessingError
    ) {
      // Stale metadata or keys can fail a valid sign-in: the next one rediscovers.
      forgetFederation(federation.key);
      log.warn('Federation code exchange failed', { strategy: federation.key, error: error.message });
      throw new AppError(401, 'invalid_credentials', 'error', { meta: { strategy: federation.key }, originalError: error });
    }
    throw error;
  }
};
