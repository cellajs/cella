import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type Provider from 'oidc-provider';
import { vi } from 'vitest';
import { ensureSigningKeys } from '#/modules/oauth-server/keystore';
import { createProvider } from '#/modules/oauth-server/provider';
import { createOauthListener } from '#/modules/oauth-server/server';

export interface TestOauthServer {
  provider: Provider;
  /** `http://127.0.0.1:<port>/oauth`: the mounted prefix, as the reverse proxy would present it. */
  issuer: string;
  close: () => Promise<void>;
}

/** The authorization server in-process on a random port; tokens verify against the same keystore the guards read. */
export async function startTestOauthServer(): Promise<TestOauthServer> {
  await ensureSigningKeys();
  const provider = await createProvider();
  const server: Server = createServer(createOauthListener(provider)).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}/oauth`;
  return { provider, issuer, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

/**
 * Answers the provider's fetch of a Client ID Metadata Document from memory, keyed by the `client_id` URL; every other
 * request goes out as usual. Returns the restore function.
 */
export function serveClientMetadataDocuments(documents: Record<string, Record<string, unknown>>): () => void {
  const realFetch = globalThis.fetch;
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const document = documents[url];
    if (!document) return realFetch(input, init);
    return new Response(JSON.stringify({ client_id: url, ...document }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  return () => spy.mockRestore();
}

export async function clientCredentialsToken(
  issuer: string,
  client: { clientId: string; clientSecret: string },
  params: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const basic = Buffer.from(`${client.clientId}:${client.clientSecret}`).toString('base64');
  const response = await fetch(`${issuer}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
    body: new URLSearchParams({ grant_type: 'client_credentials', ...params }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/** A path-blind cookie jar: the provider scopes its cookies by path, the server never minds receiving extras. */
class CookieJar {
  private readonly cookies = new Map<string, string>();
  constructor(initial: string[] = []) {
    for (const cookie of initial) this.store(cookie);
  }
  store(setCookie: string): void {
    const [pair] = setCookie.split(';');
    const index = pair.indexOf('=');
    if (index > 0) this.cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
  absorb(response: Response): void {
    for (const cookie of response.headers.getSetCookie()) this.store(cookie);
  }
  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

const base64url = (buffer: Buffer) => buffer.toString('base64url');

export interface AuthorizationInput {
  clientId: string;
  redirectUri: string;
  scope: string;
  resource: string;
  sessionCookie: string;
}

type TokenResponse = { status: number; body: Record<string, unknown> };

/**
 * The authorization request with PKCE as a public client, consenting (accept) through the app's interaction routes with
 * the user's session cookie, up to the redirect back to the client: what an MCP client and the consent page do together.
 * `failure` holds the details answer when it is not 200, or the error the redirect carries.
 */
export async function authorizationCode(
  issuer: string,
  input: AuthorizationInput,
): Promise<{ code: string | null; verifier: string; consent: Record<string, unknown>; failure: TokenResponse | null }> {
  const origin = new URL(issuer).origin;
  const jar = new CookieJar([input.sessionCookie]);
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  const state = base64url(randomBytes(8));

  const authorize = new URL(`${issuer}/auth`);
  authorize.search = new URLSearchParams({
    client_id: input.clientId,
    response_type: 'code',
    redirect_uri: input.redirectUri,
    scope: input.scope,
    resource: input.resource,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  }).toString();

  const start = await fetch(authorize, { redirect: 'manual' });
  jar.absorb(start);
  const interaction = start.headers.get('location') ?? '';
  const uid = /\/oauth\/interaction\/([^/?]+)/.exec(interaction)?.[1];
  if (start.status !== 303 || !uid)
    throw new Error(`Expected an interaction redirect, got ${start.status} ${interaction}`);

  const details = await fetch(`${origin}/oauth/interaction/${uid}/details`, { headers: { Cookie: jar.header() } });
  const consent = (await details.json()) as Record<string, unknown>;
  if (details.status !== 200)
    return { code: null, verifier, consent, failure: { status: details.status, body: consent } };

  const decision = await fetch(`${origin}/oauth/interaction/${uid}/consent`, {
    method: 'POST',
    headers: { Cookie: jar.header(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ accept: true }),
  });
  jar.absorb(decision);
  const { redirectTo } = (await decision.json()) as { redirectTo: string };

  // Resume the authorization request; the provider may hop once more before landing on the client's redirect URI.
  let location = redirectTo;
  let code: string | null = null;
  for (let hop = 0; hop < 5 && !code; hop++) {
    const response = await fetch(location, { redirect: 'manual', headers: { Cookie: jar.header() } });
    jar.absorb(response);
    const next = response.headers.get('location');
    if (!next) throw new Error(`Authorization stopped at ${location} with ${response.status}`);
    const again = /\/oauth\/interaction\/([^/?]+)$/.exec(next)?.[1];
    if (again) {
      const why = await fetch(`${origin}/oauth/interaction/${again}/details`, { headers: { Cookie: jar.header() } });
      throw new Error(`Provider asked for another interaction: ${JSON.stringify((await why.json()).prompt)}`);
    }
    if (next.startsWith(input.redirectUri)) {
      const params = new URL(next).searchParams;
      if (params.get('state') !== state) throw new Error('state mismatch');
      if (params.get('error'))
        return { code: null, verifier, consent, failure: { status: 400, body: Object.fromEntries(params) } };
      code = params.get('code');
    } else {
      location = next.startsWith('/') ? `${origin}${next}` : next;
    }
  }
  if (!code) throw new Error('No authorization code after 5 hops');
  return { code, verifier, consent, failure: null };
}

async function tokenRequest(issuer: string, params: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(`${issuer}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/** The code exchange of a public client (PKCE, no client authentication). */
export function exchangeCode(
  issuer: string,
  input: { clientId: string; redirectUri: string; code: string; verifier: string },
): Promise<TokenResponse> {
  return tokenRequest(issuer, {
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.clientId,
    code_verifier: input.verifier,
  });
}

/** The refresh_token grant of a public client; the provider rotates the refresh token on every use. */
export function refreshAccessToken(issuer: string, input: { clientId: string; refreshToken: string }) {
  return tokenRequest(issuer, {
    grant_type: 'refresh_token',
    refresh_token: input.refreshToken,
    client_id: input.clientId,
  });
}

/** Consent and code exchange in one go; a refusal on the way comes back as `status` and `body`. */
export async function authorizationCodeToken(
  issuer: string,
  input: AuthorizationInput,
): Promise<{ status: number; body: Record<string, unknown>; consent: Record<string, unknown> }> {
  const { code, verifier, consent, failure } = await authorizationCode(issuer, input);
  if (failure || !code) return { ...(failure ?? { status: 400, body: {} }), consent };
  return { ...(await exchangeCode(issuer, { ...input, code, verifier })), consent };
}
