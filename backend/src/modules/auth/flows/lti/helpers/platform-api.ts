import { randomUUID } from 'node:crypto';
import { z } from '@hono/zod-openapi';
import { type JWTPayload, SignJWT } from 'jose';
import type { AccessScope } from 'shared';
import { AppError } from '#/core/error';
import { maxLength } from '#/db/utils/constraints';
import { type GuardedFetchInit, guardedFetch, isFetchableUrl } from '#/lib/guarded-fetch';
import { ltiApiClaim, ltiTestUserRole } from '#/lib/lti-vocabulary';
import type { LtiImportIssue } from '#/modules/auth/flows/lti/lti-contexts-db';
import { ltiIdSchema, profileClaim } from '#/modules/auth/flows/lti/lti-schema';
import type { LtiConnection } from '#/modules/connections/connections-db';
import { currentSigningKey } from '#/modules/oauth-server/keystore';

/** Tests answer from a fake platform; production reaches the platform through the guarded fetch's own. */
export type PlatformFetchOptions = Pick<GuardedFetchInit, 'resolve' | 'transport'>;

/** The access scope a member import asks a platform built on the template for, at registration and in each token request. */
export const ltiImportScope: AccessScope = 'user:read';

/** The rows one page of a member list asks for: a page of long rows stays under the guarded fetch's size cap. */
const membersPageSize = 50;

/** The most pages one import reads, whatever the platform answers per page. */
export const maxMembersPages = 40;

/** The most rows one import reads; the platform's list goes on unread past it. */
const maxMembersRead = 2000;

/** How long a client assertion is good for: one token request. */
const assertionLifetimeSeconds = 60;

/** How long before its expiry a cached token is replaced by a new one. */
const tokenRenewMarginSeconds = 60;

/** Where a context's people are read: the platform's API, and the first page of the context's members under it. */
export interface PlatformApi {
  apiUrl: string;
  membersUrl: string;
}

/** Whether `url` lies under `base`: the same origin, and the base's path a prefix of its own. */
export const isUnder = (url: URL, base: URL) => {
  const basePath = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
  return url.origin === base.origin && url.pathname.startsWith(basePath);
};

/**
 * The API addresses a platform named, when the app trusts them: the API on the origin of the connection's token
 * endpoint or issuer, and the member list under the API. The installation's token goes wherever they point.
 * @returns Undefined for any other pair.
 */
export const trustedPlatformApi = (connection: LtiConnection, { apiUrl, membersUrl }: PlatformApi): PlatformApi | undefined => {
  if (!isFetchableUrl(apiUrl) || !isFetchableUrl(membersUrl)) return undefined;
  const api = new URL(apiUrl);
  const members = new URL(membersUrl);
  const platformOrigins = [connection.issuer, connection.config.tokenEndpoint].flatMap((address) =>
    URL.canParse(address) ? [new URL(address).origin] : [],
  );
  if (!platformOrigins.includes(api.origin) || api.search || api.hash || members.hash || !isUnder(members, api)) return undefined;
  return { apiUrl, membersUrl };
};

/** The members of the API claim a platform built on the template adds to a launch (`ltiApiClaim`) that the import reads. */
const apiClaimSchema = z.object({ api_url: z.string().max(maxLength.url), members_url: z.string().max(maxLength.url) });

/** The API addresses a verified launch names in the claim under its connection's issuer, when the app trusts them. */
export const launchPlatformApi = (connection: LtiConnection, claims: JWTPayload): PlatformApi | undefined => {
  const claim = apiClaimSchema.safeParse(claims[ltiApiClaim(connection.issuer)]).data;
  return claim && trustedPlatformApi(connection, { apiUrl: claim.api_url, membersUrl: claim.members_url });
};

const readFailed = (reason: string, connection: LtiConnection) =>
  new AppError(400, 'outbound_request_failed', 'warn', { meta: { reason, connectionId: connection.id } });

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/**
 * A client assertion for the connection's registration (`private_key_jwt`), signed with the key the app's key set
 * publishes. Its audience is the platform's authorization server when the platform named one, else its token endpoint.
 */
const signClientAssertion = async ({ clientId, config }: LtiConnection) => {
  const { kid, key } = await currentSigningKey();
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
    .setIssuer(clientId)
    .setSubject(clientId)
    .setAudience(config.authorizationServer ?? config.tokenEndpoint)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${assertionLifetimeSeconds}s`)
    .sign(key);
};

const tokenAnswerSchema = z.object({
  access_token: z
    .string()
    .min(1)
    .max(16 * 1024),
  token_type: z.string().regex(/^bearer$/i),
  expires_in: z.number().int().positive().optional(),
});

const oauthErrorSchema = z.object({ error: z.string().max(maxLength.field) });

/** Tokens per connection and resource in this process, until shortly before they expire; never shared between connections. */
const tokens = new Map<string, { accessToken: string; renewAt: number }>();

const tokenKey = (connection: LtiConnection, resource: string) => `${connection.id} ${resource}`;

type TokenOutcome = { accessToken: string } | { refusal: LtiImportIssue };

/**
 * The connection's token for the platform's API at `resource`, within `ltiImportScope`: the cached one, else a new one
 * from the token endpoint by `client_credentials`. An OAuth error is the platform's answer and a refusal:
 * `invalid_scope`, the scope not granted, is a normal state.
 * @throws AppError 400 `outbound_request_failed` for any other answer, and what `guardedFetch` throws.
 */
const platformToken = async (connection: LtiConnection, resource: string, options: PlatformFetchOptions): Promise<TokenOutcome> => {
  const cached = tokens.get(tokenKey(connection, resource));
  if (cached && cached.renewAt > Date.now()) return cached;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: await signClientAssertion(connection),
    scope: ltiImportScope,
    resource,
  });
  const response = await guardedFetch(connection.config.tokenEndpoint, {
    ...options,
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const answer = parseJson(response.text);

  const refusal = response.status >= 400 && response.status < 500 && oauthErrorSchema.safeParse(answer).data;
  if (refusal) return { refusal: refusal.error === 'invalid_scope' ? 'scope_not_granted' : 'token_refused' };
  const token = response.status === 200 && tokenAnswerSchema.safeParse(answer).data;
  if (!token) throw readFailed('token_answer', connection);

  const accessToken = token.access_token;
  if (token.expires_in)
    tokens.set(tokenKey(connection, resource), { accessToken, renewAt: Date.now() + (token.expires_in - tokenRenewMarginSeconds) * 1000 });
  return { accessToken };
};

/** A row of a platform's member list as the import reads it (`listLtiMembers` of the platform's API). */
const memberRowSchema = z.object({
  id: ltiIdSchema,
  roles: z.array(z.string().max(maxLength.url)).max(100),
  name: profileClaim,
  email: profileClaim,
});

export type LtiMemberRow = z.infer<typeof memberRowSchema>;

const membersPageSchema = z.object({
  results: z.array(z.unknown()).max(membersPageSize),
  nextPageToken: z.string().min(1).max(maxLength.url).optional(),
});

type MembersOutcome = { people: LtiMemberRow[]; issue: 'too_many_members' | null } | { refusal: LtiImportIssue };

/**
 * The people of an LTI context at a platform built on the template, read page by page with the connection's token.
 * A row that fails validation or names a test user is left out, and a person listed twice counts once. A 401 gets one
 * new token. The read stops at `maxMembersPages` pages or `maxMembersRead` rows.
 * @returns The people, with `too_many_members` when the platform lists more; or the refusal of the token or the list.
 * @throws AppError 400 `outbound_request_failed` for an answer that is neither a page nor a refusal, and what
 *   `guardedFetch` throws.
 */
export const readLtiMembers = async (connection: LtiConnection, api: PlatformApi, options: PlatformFetchOptions = {}): Promise<MembersOutcome> => {
  let token = await platformToken(connection, api.apiUrl, options);
  if ('refusal' in token) return token;

  const people = new Map<string, LtiMemberRow>();
  let renewed = false;
  let rows = 0;
  let pageToken: string | undefined;
  for (let pages = 0; pages < maxMembersPages && rows < maxMembersRead; ) {
    const url = new URL(api.membersUrl);
    url.searchParams.set('maxPageSize', String(membersPageSize));
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await guardedFetch(url.href, {
      ...options,
      headers: { Accept: 'application/json', Authorization: `Bearer ${token.accessToken}` },
    });

    if (response.status === 401 && !renewed) {
      renewed = true;
      tokens.delete(tokenKey(connection, api.apiUrl));
      token = await platformToken(connection, api.apiUrl, options);
      if ('refusal' in token) return token;
      continue;
    }
    if ([401, 403, 404].includes(response.status)) return { refusal: 'members_refused' };
    const page = response.status === 200 && membersPageSchema.safeParse(parseJson(response.text)).data;
    if (!page) throw readFailed('members_page', connection);

    for (const row of page.results.slice(0, maxMembersRead - rows)) {
      rows += 1;
      const member = memberRowSchema.safeParse(row).data;
      if (member && !member.roles.includes(ltiTestUserRole)) people.set(member.id, member);
    }
    pages += 1;
    pageToken = page.nextPageToken;
    if (!pageToken) return { people: [...people.values()], issue: null };
  }
  return { people: [...people.values()], issue: 'too_many_members' };
};
