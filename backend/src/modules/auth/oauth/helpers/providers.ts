import * as oauth from 'oauth4webapi';
import { appConfig } from 'shared';
import { env } from '#/env';
import {
  type AuthorizationResponse,
  authorizationResponseParams,
  authorizationUrl,
  isProviderRefusal,
  providerDeadline,
} from '#/modules/auth/oauth/helpers/code-flow';

/** Thrown when the provider rejects the authorization response or code exchange (bad, expired, or replayed code). */
export class OAuthCodeExchangeError extends Error {
  constructor(cause: Error) {
    super(cause.message, { cause });
    this.name = 'OAuthCodeExchangeError';
  }
}

/** What a code exchange yields: the access token and, for an OIDC provider, the claims of the sign-in. */
export interface ProviderGrant {
  accessToken: string;
  /** The userinfo claims with the id_token's over them, so the subject and the address are the id_token's. */
  claims?: oauth.UserInfoResponse;
}

/** Per-flow values minted at initiation and echoed back on the callback via the state cookie; only an OIDC provider takes a nonce. */
export type OAuthFlowContext = { codeVerifier: string; nonce?: string };

type ProviderSetup = {
  as: oauth.AuthorizationServer & { authorization_endpoint: string };
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** OIDC providers get id_token validation: nonce binding, claim checks, and a JWKS signature check */
  oidc: boolean;
  /** Multi-tenant Entra aliases issue id_tokens whose `iss` embeds the user's tenant; resolve it before validation */
  resolveIssuerFromIdToken?: boolean;
};

/**
 * Resolves the effective Entra ID issuer for multi-tenant sign-in: 'common', 'organizations' and 'consumers' are not real issuers, since
 * the id_token `iss` claim embeds the user's tenant id. Claim and signature validation run against the resolved issuer.
 */
const resolveEntraIssuer = async (response: Response, as: oauth.AuthorizationServer): Promise<oauth.AuthorizationServer> => {
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
const createProviderClient = ({ as, clientId, clientSecret, redirectUri, oidc, resolveIssuerFromIdToken }: ProviderSetup) => {
  const client: oauth.Client = { client_id: clientId };

  return {
    /** False without a client id and secret in the environment: the provider would refuse the round trip. */
    configured: Boolean(clientId && clientSecret),
    /** An OIDC provider: its round trip carries a nonce, which the id_token must echo. */
    oidc,

    /** Builds the provider authorization URL with state, scopes, the PKCE challenge and, for an OIDC provider, the nonce. */
    createAuthorizationURL(state: string, scopes: string[], { codeVerifier, nonce }: OAuthFlowContext): Promise<URL> {
      return authorizationUrl(as.authorization_endpoint, { clientId, redirectUri, scopes, state, codeVerifier, nonce });
    },

    /**
     * Exchanges the authorization code for tokens with the PKCE verifier. OIDC providers also get id_token claim
     * validation, `nonce` binding and a signature check against the provider JWKS, then userinfo, refused unless its
     * `sub` is the id_token's (OIDC Core §5.3.2).
     */
    async validateAuthorizationCode(response: AuthorizationResponse, { codeVerifier, nonce }: OAuthFlowContext): Promise<ProviderGrant> {
      try {
        // Created lazily: ClientSecretPost rejects empty secrets, which can be absent at module load (CI openapi generation, deployments without this provider)
        const clientAuth = oauth.ClientSecretPost(clientSecret);
        // A multi-tenant alias learns its tenant's issuer from the id_token: its response `iss` is compared once that is known.
        const params = authorizationResponseParams({ ...response, iss: resolveIssuerFromIdToken ? undefined : response.iss });
        const callbackParams = oauth.validateAuthResponse(as, client, params, response.state);
        const tokenResponse = await oauth.authorizationCodeGrantRequest(as, client, clientAuth, callbackParams, redirectUri, codeVerifier, {
          signal: providerDeadline(),
        });

        const effectiveAs = resolveIssuerFromIdToken ? await resolveEntraIssuer(tokenResponse, as) : as;
        if (response.iss && response.iss !== effectiveAs.issuer) {
          throw new OAuthCodeExchangeError(new Error('unexpected "iss" (issuer) response parameter value'));
        }
        const tokens = await oauth.processAuthorizationCodeResponse(effectiveAs, client, tokenResponse, {
          requireIdToken: oidc,
          expectedNonce: oidc ? (nonce ?? oauth.expectNoNonce) : undefined,
        });

        if (!oidc) return { accessToken: tokens.access_token };

        // Defense-in-depth on top of the TLS-level trust in the direct token-endpoint exchange
        await oauth.validateApplicationLevelSignature(effectiveAs, tokenResponse, { signal: providerDeadline() });
        const idClaims = oauth.getValidatedIdTokenClaims(tokens);
        if (!idClaims) throw new OAuthCodeExchangeError(new Error('id_token missing'));

        const userinfoResponse = await oauth.userInfoRequest(effectiveAs, client, tokens.access_token, { signal: providerDeadline() });
        const userinfo = await oauth.processUserInfoResponse(effectiveAs, client, idClaims.sub, userinfoResponse);
        return { accessToken: tokens.access_token, claims: { ...userinfo, ...idClaims } };
      } catch (error) {
        if (isProviderRefusal(error)) throw new OAuthCodeExchangeError(error);
        throw error;
      }
    },
  };
};

export const githubAuth = createProviderClient({
  as: {
    // The issuer of GitHub's server metadata (RFC 8414), which its callbacks name in `iss`.
    issuer: 'https://github.com/login/oauth',
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
    userinfo_endpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
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
    userinfo_endpoint: 'https://graph.microsoft.com/oidc/userinfo',
    jwks_uri: `https://login.microsoftonline.com/${entraTenant}/discovery/v2.0/keys`,
  },
  clientId: env.MICROSOFT_CLIENT_ID || '',
  clientSecret: env.MICROSOFT_CLIENT_SECRET || '',
  redirectUri: `${appConfig.backendAuthUrl}/microsoft/callback`,
  oidc: true,
  resolveIssuerFromIdToken: entraIsMultiTenant,
});

// The profile fields the app reads, per provider; each provider sends more.
export interface GithubUserProps {
  id: number;
  login: string;
  name: string | null;
}

export interface GithubUserEmailProps {
  email: string;
  primary: boolean;
  verified: boolean;
}

export interface GoogleUserProps {
  sub: string;
  name: string;
  given_name: string;
  family_name: string;
  email: string;
  email_verified: boolean;
}

export interface MicrosoftUserProps {
  sub: string;
  name: string;
  givenname: string;
  familyname: string;
  email?: string;
}
