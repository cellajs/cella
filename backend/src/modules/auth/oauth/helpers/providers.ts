import * as oauth from 'oauth4webapi';
import { appConfig, type EnabledOAuthProvider } from 'shared';
import { env } from '../../../../env';

/** Thrown when the provider rejects the authorization response or code exchange (bad, expired, or replayed code). */
export class OAuthCodeExchangeError extends Error {
  constructor(cause: Error) {
    super(cause.message, { cause });
    this.name = 'OAuthCodeExchangeError';
  }
}

/** Per-flow values minted at initiation and echoed back on the callback via the state cookie. */
export type OAuthFlowContext = { codeVerifier?: string; nonce?: string };

type ProviderSetup = {
  as: oauth.AuthorizationServer;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** OIDC providers get id_token validation: nonce binding, claim checks, and a JWKS signature check */
  oidc: boolean;
  /** Multi-tenant Entra aliases issue id_tokens whose `iss` embeds the user's tenant; resolve it before validation */
  resolveIssuerFromIdToken?: boolean;
};

/**
 * Resolves the effective Entra ID issuer for multi-tenant sign-in ('common'/'organizations'/'consumers'):
 * those aliases are not real issuers, since the id_token `iss` claim embeds the user's actual tenant id (`tid`).
 * Claim and signature validation then run against the resolved issuer; the signing keys are tenant-agnostic.
 */
const resolveEntraIssuer = async (
  response: Response,
  as: oauth.AuthorizationServer,
): Promise<oauth.AuthorizationServer> => {
  const body = (await response
    .clone()
    .json()
    .catch(() => null)) as { id_token?: unknown } | null;
  if (!body || typeof body.id_token !== 'string') return as;

  try {
    const payload = JSON.parse(Buffer.from(body.id_token.split('.')[1], 'base64url').toString()) as { tid?: unknown };
    if (typeof payload.tid !== 'string' || !/^[a-zA-Z0-9-]+$/.test(payload.tid)) return as;
    return { ...as, issuer: `https://login.microsoftonline.com/${payload.tid}/v2.0` };
  } catch {
    return as;
  }
};

/** Creates a per-provider OAuth client: authorization-URL building and code exchange on `oauth4webapi`. */
const createProviderClient = ({
  as,
  clientId,
  clientSecret,
  redirectUri,
  oidc,
  resolveIssuerFromIdToken,
}: ProviderSetup) => {
  const client: oauth.Client = { client_id: clientId };

  return {
    /** Builds the provider authorization URL with state, scopes, and an optional PKCE challenge + OIDC nonce. */
    async createAuthorizationURL(
      state: string,
      scopes: string[],
      { codeVerifier, nonce }: OAuthFlowContext = {},
    ): Promise<URL> {
      const url = new URL(as.authorization_endpoint as string);
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
      return url;
    },

    /**
     * Exchanges the authorization code for tokens. Enforces PKCE when a `codeVerifier` is given; for
     * OIDC providers additionally validates the id_token claims, binds the `nonce`, and verifies the
     * signature against the provider JWKS.
     */
    async validateAuthorizationCode(
      code: string,
      state: string,
      { codeVerifier, nonce }: OAuthFlowContext = {},
    ): Promise<{ accessToken: string }> {
      try {
        // Created lazily: ClientSecretPost rejects empty secrets, and they may legitimately be
        // absent at module load (CI openapi generation, deployments without this provider)
        const clientAuth = oauth.ClientSecretPost(clientSecret);
        const callbackParams = oauth.validateAuthResponse(as, client, new URLSearchParams({ code, state }), state);
        const response = await oauth.authorizationCodeGrantRequest(
          as,
          client,
          clientAuth,
          callbackParams,
          redirectUri,
          codeVerifier ?? oauth.nopkce,
        );

        const effectiveAs = resolveIssuerFromIdToken ? await resolveEntraIssuer(response, as) : as;
        const tokens = await oauth.processAuthorizationCodeResponse(effectiveAs, client, response, {
          requireIdToken: oidc,
          expectedNonce: oidc ? (nonce ?? oauth.expectNoNonce) : undefined,
        });

        // Defense-in-depth on top of the TLS-level trust in the direct token-endpoint exchange
        if (oidc) await oauth.validateApplicationLevelSignature(effectiveAs, response);

        return { accessToken: tokens.access_token };
      } catch (error) {
        if (
          error instanceof oauth.ResponseBodyError ||
          error instanceof oauth.AuthorizationResponseError ||
          error instanceof oauth.WWWAuthenticateChallengeError ||
          error instanceof oauth.OperationProcessingError
        ) {
          throw new OAuthCodeExchangeError(error);
        }
        throw error;
      }
    },
  };
};

export const githubAuth = createProviderClient({
  as: {
    issuer: 'https://github.com',
    authorization_endpoint: 'https://github.com/login/oauth/authorize',
    token_endpoint: 'https://github.com/login/oauth/access_token',
  },
  clientId: env.GITHUB_CLIENT_ID || '',
  clientSecret: env.GITHUB_CLIENT_SECRET || '',
  redirectUri: `${appConfig.backendAuthUrl}/github/callback`,
  oidc: false,
});

export const googleAuth = createProviderClient({
  as: {
    issuer: 'https://accounts.google.com',
    authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    token_endpoint: 'https://oauth2.googleapis.com/token',
    jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
  },
  clientId: env.GOOGLE_CLIENT_ID || '',
  clientSecret: env.GOOGLE_CLIENT_SECRET || '',
  redirectUri: `${appConfig.backendAuthUrl}/google/callback`,
  oidc: true,
});

// Use 'common' if no tenant is specified; 'common'/'organizations'/'consumers' are multi-tenant aliases
const entraTenant = env.MICROSOFT_TENANT_ID || 'common';
const entraIsMultiTenant = ['common', 'organizations', 'consumers'].includes(entraTenant);

export const microsoftAuth = createProviderClient({
  as: {
    issuer: `https://login.microsoftonline.com/${entraTenant}/v2.0`,
    authorization_endpoint: `https://login.microsoftonline.com/${entraTenant}/oauth2/v2.0/authorize`,
    token_endpoint: `https://login.microsoftonline.com/${entraTenant}/oauth2/v2.0/token`,
    jwks_uri: `https://login.microsoftonline.com/${entraTenant}/discovery/v2.0/keys`,
  },
  clientId: env.MICROSOFT_CLIENT_ID || '',
  clientSecret: env.MICROSOFT_CLIENT_SECRET || '',
  redirectUri: `${appConfig.backendAuthUrl}/microsoft/callback`,
  oidc: true,
  resolveIssuerFromIdToken: entraIsMultiTenant,
});

export type Provider = { id: EnabledOAuthProvider; userId: string };

export interface GithubUserProps {
  avatar_url: string;
  bio: string | null;
  blog: string | null;
  company: string | null;
  created_at: string;
  email: string | null;
  events_url: string;
  followers: number;
  followers_url: string;
  following: number;
  following_url: string;
  gists_url: string;
  gravatar_id: string | null;
  hireable: boolean | null;
  html_url: string;
  id: number;
  location: string | null;
  login: string;
  name: string | null;
  node_id: string;
  organizations_url: string;
  public_gists: number;
  public_repos: number;
  received_events_url: string;
  repos_url: string;
  site_admin: boolean;
  starred_url: string;
  subscriptions_url: string;
  type: string;
  updated_at: string;
  url: string;
}

export interface GithubUserEmailProps {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

export interface GoogleUserProps {
  sub: string;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
  email: string;
  email_verified: boolean;
  locale: string;
}

export interface MicrosoftUserProps {
  sub: string;
  name: string;
  givenname: string;
  familyname: string;
  picture: string;
  email?: string;
}
