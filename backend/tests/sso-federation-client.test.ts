import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { LogFn } from 'shared/pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '#/core/error';
import { toClientError } from '#/lib/error';
import { createFederationAuthorizationUrl, exchangeFederationCode, forgetFederation } from '#/modules/auth/sso/helpers/federation-client';
import type { Federation } from '#/modules/auth/sso/helpers/federations';

// `log` and `toClientError` write here through a logger with the backend's redaction, each line through a fresh facade:
// one facade's dedup window would keep the second refusal's line out.
const logged = vi.hoisted(() => ({ lines: [] as string[] }));
vi.mock('#/lib/pino', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/lib/pino')>();
  const { createLog } = await import('shared/pino');
  const { collectingLogger } = await import('shared/testing/telemetry');
  const { logger, lines } = collectingLogger(actual.backendRedactPaths);
  logged.lines = lines;
  const severities = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
  const baseLog = Object.fromEntries(severities.map((severity) => [severity, (...args: Parameters<LogFn>) => createLog(logger)[severity](...args)]));
  return { ...actual, baseLog };
});

const issuer = 'https://connect.test.surfconext.nl';

const federation: Federation = {
  key: 'surfconext',
  label: 'SURFconext',
  issuer,
  scopes: ['openid'],
  clientAuthMethod: 'client_secret_basic',
  tenantClaim: 'schac_home_organization',
  snapshotClaims: ['eduperson_affiliation'],
  addressAuthority: true,
  clientId: 'test.projectcampus.com',
  clientSecret: 'test-secret',
  redirectUri: 'http://localhost:3000/api/auth/sso/callback',
};

const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'key_2026_10_02', alg: 'RS256', use: 'sig' };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** An id_token the federation would mint for this client: signed with the key its JWKS publishes. */
const idToken = (claims: Record<string, unknown>, { audience = federation.clientId, expiresAt }: { audience?: string; expiresAt?: number } = {}) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject('0dd64f5cf2a23bef04a1e2ec225e76ff3935cece')
    .setIssuedAt()
    .setExpirationTime(expiresAt ?? '5m')
    .sign(privateKey);

/**
 * A SURFconext stand-in behind `fetch`: the discovery document, the token endpoint (checking the client's basic
 * authentication and the code), the key set and userinfo. Counts the calls per path and keeps the id_tokens it issued.
 * `tokenResponse` overrides members of the token response; `expiresAt` (epoch seconds) dates the id_token's expiry.
 */
const federationServer = (options: {
  nonce: string;
  tokenAudience?: string;
  userinfoSub?: string;
  tokenResponse?: Record<string, unknown>;
  expiresAt?: number;
}) => {
  const calls: Record<string, number> = {};
  const idTokens: string[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls[url.pathname] = (calls[url.pathname] ?? 0) + 1;

    switch (url.pathname) {
      case '/.well-known/openid-configuration':
        return json({
          issuer,
          authorization_endpoint: `${issuer}/oidc/authorize`,
          token_endpoint: `${issuer}/oidc/token`,
          userinfo_endpoint: `${issuer}/oidc/userinfo`,
          jwks_uri: `${issuer}/oidc/certs`,
          response_types_supported: ['code'],
          subject_types_supported: ['pairwise'],
          id_token_signing_alg_values_supported: ['RS256'],
          token_endpoint_auth_methods_supported: ['client_secret_basic'],
          code_challenge_methods_supported: ['S256'],
        });
      case '/oidc/token': {
        // Basic authentication per RFC 6749 §2.3.1: both parts form-url-encoded before base64, so decode them to compare.
        const authorization = new Headers(init?.headers).get('authorization') ?? '';
        const [username, password] = atob(authorization.replace(/^Basic /, ''))
          .split(':')
          .map(decodeURIComponent);
        if (username !== federation.clientId || password !== federation.clientSecret) return json({ error: 'invalid_client' }, 401);
        const body = new URLSearchParams(String(init?.body));
        if (body.get('grant_type') !== 'authorization_code' || body.get('code') !== 'the-code') return json({ error: 'invalid_grant' }, 400);
        const issued = await idToken(
          { nonce: options.nonce, acr: 'urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport' },
          { audience: options.tokenAudience, expiresAt: options.expiresAt },
        );
        idTokens.push(issued);
        return json({ access_token: 'the-access-token', token_type: 'Bearer', expires_in: 3600, id_token: issued, ...options.tokenResponse });
      }
      case '/oidc/certs':
        return json({ keys: [jwk] });
      case '/oidc/userinfo':
        if (new Headers(init?.headers).get('authorization') !== 'Bearer the-access-token') return json({ error: 'invalid_token' }, 401);
        return json({
          sub: options.userinfoSub ?? '0dd64f5cf2a23bef04a1e2ec225e76ff3935cece',
          schac_home_organization: 'hu.nl',
          email: 's.devries@student.hu.nl',
          given_name: 'Sanne',
          family_name: 'de Vries',
          eduperson_affiliation: ['student', 'member'],
        });
      default:
        return new Response('not found', { status: 404 });
    }
  };
  return { fetch, calls, idTokens };
};

const roundTrip = { state: 'the-state', codeVerifier: 'a'.repeat(43), nonce: 'the-nonce' };

describe('federation client', () => {
  beforeEach(() => forgetFederation(federation.key));

  it('builds the authorization URL from the discovered endpoint: code flow, PKCE S256, nonce and the IdP pin', async () => {
    const server = federationServer({ nonce: roundTrip.nonce });
    const url = await createFederationAuthorizationUrl(federation, { ...roundTrip, loginHint: 'https://idp.hu.nl/a,https://idp.hu.nl/b' }, server);

    expect(url.origin + url.pathname).toBe(`${issuer}/oidc/authorize`);
    const params = Object.fromEntries(url.searchParams);
    expect(params).toMatchObject({
      client_id: federation.clientId,
      redirect_uri: federation.redirectUri,
      response_type: 'code',
      scope: 'openid',
      state: roundTrip.state,
      nonce: roundTrip.nonce,
      code_challenge_method: 'S256',
      login_hint: 'https://idp.hu.nl/a,https://idp.hu.nl/b',
    });
    expect(params.code_challenge).toHaveLength(43);
  });

  it('exchanges the code and returns the verified id_token claims with userinfo over them', async () => {
    const server = federationServer({ nonce: roundTrip.nonce });
    const claims = await exchangeFederationCode(federation, { ...roundTrip, code: 'the-code' }, server);

    expect(claims).toMatchObject({
      iss: issuer,
      sub: '0dd64f5cf2a23bef04a1e2ec225e76ff3935cece',
      acr: 'urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport',
      schac_home_organization: 'hu.nl',
      email: 's.devries@student.hu.nl',
      eduperson_affiliation: ['student', 'member'],
    });
    // Discovery and the key set are fetched once per process; the token and userinfo endpoints once per sign-in.
    await exchangeFederationCode(federation, { ...roundTrip, code: 'the-code' }, server);
    expect(server.calls['/.well-known/openid-configuration']).toBe(1);
    expect(server.calls['/oidc/certs']).toBe(1);
    expect(server.calls['/oidc/token']).toBe(2);
  });

  it('refuses an id_token minted for another nonce, another client, or a userinfo of another subject', async () => {
    const refusal = async (server: ReturnType<typeof federationServer>, nonce = roundTrip.nonce) => {
      const attempt = exchangeFederationCode(federation, { ...roundTrip, nonce, code: 'the-code' }, server);
      await expect(attempt).rejects.toBeInstanceOf(AppError);
      await expect(attempt).rejects.toMatchObject({ status: 401, type: 'invalid_credentials' });
    };

    await refusal(federationServer({ nonce: 'another-nonce' }));
    forgetFederation(federation.key);
    await refusal(federationServer({ nonce: roundTrip.nonce, tokenAudience: 'another-client' }));
    forgetFederation(federation.key);
    await refusal(federationServer({ nonce: roundTrip.nonce, userinfoSub: 'someone-else' }));
  });

  it("must not log the provider's tokens or ID token claims on a federation refusal", async () => {
    // The library's refusal holds what it refused: the parsed token response for a malformed member, the id_token's
    // claims (the nonce among them) for an expired token.
    const malformed = federationServer({ nonce: roundTrip.nonce, tokenResponse: { scope: ['openid'], refresh_token: 'the-refresh-token' } });
    const expired = federationServer({ nonce: roundTrip.nonce, expiresAt: Math.floor(Date.now() / 1000) - 3600 });
    logged.lines.length = 0;

    for (const server of [malformed, expired]) {
      forgetFederation(federation.key);
      const refused = await exchangeFederationCode(federation, { ...roundTrip, code: 'the-code' }, server).catch((error: unknown) => error);
      // The callback hands the refusal to the error handler, which logs it.
      expect(toClientError(refused)).toMatchObject({ status: 401, type: 'invalid_credentials' });
    }

    const written = logged.lines.join('\n');
    for (const value of ['the-access-token', 'the-refresh-token', roundTrip.nonce, ...malformed.idTokens, ...expired.idTokens]) {
      expect(written).not.toContain(value);
    }
    // Positive control: each refusal logged its type, with the library's error heading the stack.
    const refusals = logged.lines
      .map((line) => JSON.parse(line) as { type?: string; err?: { stack?: string } })
      .filter((line) => line.type === 'invalid_credentials');
    expect(refusals).toHaveLength(2);
    for (const line of refusals) expect(line.err?.stack).toMatch(/^OperationProcessingError: /);
  });

  it('refuses a code the federation rejects, and forgets the discovery so the next sign-in rediscovers', async () => {
    const server = federationServer({ nonce: roundTrip.nonce });
    const attempt = exchangeFederationCode(federation, { ...roundTrip, code: 'a-replayed-code' }, server);
    await expect(attempt).rejects.toMatchObject({ status: 401, type: 'invalid_credentials' });

    await exchangeFederationCode(federation, { ...roundTrip, code: 'the-code' }, server);
    expect(server.calls['/.well-known/openid-configuration']).toBe(2);
  });
});
