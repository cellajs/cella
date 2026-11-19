import { randomUUID } from 'node:crypto';
import { z } from '@hono/zod-openapi';
import { type JWTPayload, SignJWT } from 'jose';
import { AppError } from '#/core/error';
import { maxLength } from '#/db/utils/constraints';
import { type GuardedFetchInit, guardedFetch, isFetchableUrl } from '#/lib/guarded-fetch';
import { ltiClaims, ltiNrps, ltiTestUserRole } from '#/lib/lti-vocabulary';
import type { LtiImportIssue } from '#/modules/auth/flows/lti/lti-contexts-db';
import { ltiIdSchema, profileClaim } from '#/modules/auth/flows/lti/lti-schema';
import type { LtiConnection } from '#/modules/connections/connections-db';
import { currentSigningKey } from '#/modules/oauth-server/keystore';

/** Tests answer from a fake platform; production reaches the platform through the guarded fetch's own. */
export type PlatformFetchOptions = Pick<GuardedFetchInit, 'resolve' | 'transport'>;

/** The members one page asks for (`limit`): a page of long rows stays under the guarded fetch's size cap. */
const membersPageSize = 50;

/** The most pages one import reads. The platform's list goes on unread past it. */
export const maxMembersPages = 40;

/** The most people one import reads: a platform may answer a page with more members than it asked for. */
const maxMembers = maxMembersPages * membersPageSize;

/** How long a client assertion is good for: one token request. */
const assertionLifetimeSeconds = 60;

/** How long before its expiry a cached token is replaced by a new one. */
const tokenRenewMarginSeconds = 60;

/** Whether `url` lies under `base`: the same origin, and the base's path a prefix of its own. */
export const isUnder = (url: URL, base: URL) => {
  const basePath = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
  return url.origin === base.origin && url.pathname.startsWith(basePath);
};

/** Whether `address` lies on the origin of the platform's `issuer`: the one host the app signs for and sends a token to. */
const onIssuerOrigin = (issuer: string, address: string) =>
  URL.canParse(issuer) && URL.canParse(address) && new URL(address).origin === new URL(issuer).origin;

interface PlatformTokenAddresses {
  issuer: string;
  tokenEndpoint: string;
  authorizationServer?: string;
}

/**
 * Where a platform's token comes from: its token endpoint, and the audience of the client assertion, its authorization
 * server when it names one. Both lie on the issuer's origin, since the app signs with one key for every platform: a
 * connection whose addresses lie elsewhere registers and launches, and signs nothing.
 * @returns Undefined when either lies on another origin.
 */
const platformTokenAddresses = ({ issuer, tokenEndpoint, authorizationServer }: PlatformTokenAddresses) => {
  const audience = authorizationServer ?? tokenEndpoint;
  return onIssuerOrigin(issuer, tokenEndpoint) && onIssuerOrigin(issuer, audience) ? { tokenEndpoint, audience } : undefined;
};

/**
 * A membership address a platform named, or the next page it links to, when the app trusts it: on the origin of the
 * connection's issuer, where the installation's token goes. A next page keeps the path of the first.
 * @returns Undefined for any other address.
 */
const trustedMembershipsUrl = (connection: LtiConnection, address: string, first?: URL) => {
  if (!isFetchableUrl(address) || !onIssuerOrigin(connection.issuer, address)) return undefined;
  const url = new URL(address);
  return url.hash || (first && url.pathname !== first.pathname) ? undefined : url;
};

/** A launch's NRPS claim (Names and Role Provisioning Services 2.0, section 3.6.1.1). */
const namesRoleServiceSchema = z.object({
  context_memberships_url: z.string().max(maxLength.url),
  service_versions: z.array(z.string().max(maxLength.field)).max(20).optional(),
});

/**
 * The membership address a verified launch names in its NRPS claim, when it offers the version the import reads, or
 * names none, and the app trusts the address.
 */
export const launchMembershipsUrl = (connection: LtiConnection, claims: JWTPayload): string | undefined => {
  const claim = namesRoleServiceSchema.safeParse(claims[ltiClaims.namesRoleService]).data;
  if (!claim || (claim.service_versions && !claim.service_versions.includes(ltiNrps.version))) return undefined;
  return trustedMembershipsUrl(connection, claim.context_memberships_url) && claim.context_memberships_url;
};

const readFailed = (reason: string, connection: LtiConnection) =>
  new AppError(400, 'outbound_request_failed', 'warn', { meta: { reason, connectionId: connection.id } });

/** A platform's answer as JSON; undefined for one that does not parse. */
export const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

type TokenAddresses = NonNullable<ReturnType<typeof platformTokenAddresses>>;

/** A client assertion for the connection's registration (`private_key_jwt`), signed with the key the app's key set publishes. */
const signClientAssertion = async (clientId: string, { audience }: TokenAddresses) => {
  const { kid, key } = await currentSigningKey();
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
    .setIssuer(clientId)
    .setSubject(clientId)
    .setAudience(audience)
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

/** The most tokens one process keeps: one per connection. */
const maxCachedTokens = 500;

/** Tokens per connection in this process, until shortly before they expire; never shared between connections. */
const tokens = new Map<string, { accessToken: string; renewAt: number }>();

/** Keeps a token, after dropping the expired ones and, at the cap, the oldest: a map iterates in insertion order. */
const cacheToken = (key: string, token: { accessToken: string; renewAt: number }) => {
  for (const [held, { renewAt }] of tokens) if (renewAt <= Date.now()) tokens.delete(held);
  for (const held of tokens.keys()) {
    if (tokens.size < maxCachedTokens) break;
    tokens.delete(held);
  }
  tokens.set(key, token);
};

type TokenOutcome = { accessToken: string } | { refusal: LtiImportIssue };

/**
 * The connection's token for the NRPS scope: the cached one, else a new one from the token endpoint by
 * `client_credentials`, which names no resource, as LTI tools ask. An OAuth error is the platform's answer and a
 * refusal: `invalid_scope`, the scope not granted, is a normal state.
 * @throws AppError 400 `outbound_request_failed` for any other answer, and what `guardedFetch` throws.
 */
const platformToken = async (connection: LtiConnection, addresses: TokenAddresses, options: PlatformFetchOptions): Promise<TokenOutcome> => {
  const cached = tokens.get(connection.id);
  if (cached && cached.renewAt > Date.now()) return cached;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: await signClientAssertion(connection.clientId, addresses),
    scope: ltiNrps.scope,
  });
  const response = await guardedFetch(addresses.tokenEndpoint, {
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
  if (token.expires_in) cacheToken(connection.id, { accessToken, renewAt: Date.now() + (token.expires_in - tokenRenewMarginSeconds) * 1000 });
  return { accessToken };
};

/** A member of a platform's membership container as the import reads it (NRPS 2.0, section 2.2): the claims a launch reads. */
const memberSchema = z.object({
  user_id: ltiIdSchema,
  roles: z.array(z.string().max(maxLength.url)).max(100),
  /** NRPS takes a member that names none as `Active`. */
  status: z.string().max(maxLength.field).optional(),
  name: profileClaim,
  given_name: profileClaim,
  family_name: profileClaim,
  email: profileClaim,
});

export type LtiMember = z.infer<typeof memberSchema>;

const membershipContainerSchema = z.object({ members: z.array(z.unknown()) });

/** The target of a `Link` header's `rel="next"` (RFC 8288), resolved against the page it came with; undefined without one. */
const nextLink = (header: string | null, page: URL) => {
  for (const [, target, params] of (header ?? '').matchAll(/<([^>]*)>([^,]*)/g)) {
    const rel = /;\s*rel\s*=\s*"?([^";]*)"?/i.exec(params)?.[1];
    if (rel?.toLowerCase().split(/\s+/).includes('next') && URL.canParse(target, page)) return new URL(target, page).href;
  }
  return undefined;
};

type MembersOutcome = { people: LtiMember[]; issue: 'too_many_members' | null } | { refusal: LtiImportIssue };

/** The pages of a context's membership container from `first`, read with the connection's token from `addresses`. */
const readMemberPages = async (
  connection: LtiConnection,
  addresses: TokenAddresses,
  first: URL,
  options: PlatformFetchOptions,
): Promise<MembersOutcome> => {
  let token = await platformToken(connection, addresses, options);
  if ('refusal' in token) return token;

  const people = new Map<string, LtiMember>();
  let renewed = false;
  let page = new URL(first);
  page.searchParams.set('limit', String(membersPageSize));
  for (let pages = 0; pages < maxMembersPages; ) {
    const response = await guardedFetch(page.href, {
      ...options,
      headers: { Accept: ltiNrps.mediaType, Authorization: `Bearer ${token.accessToken}` },
    });

    if (response.status === 401 && !renewed) {
      renewed = true;
      tokens.delete(connection.id);
      token = await platformToken(connection, addresses, options);
      if ('refusal' in token) return token;
      continue;
    }
    if ([401, 403, 404].includes(response.status)) return { refusal: 'members_refused' };
    const container = response.status === 200 && membershipContainerSchema.safeParse(parseJson(response.text)).data;
    if (!container) throw readFailed('members_page', connection);

    for (const row of container.members) {
      const member = memberSchema.safeParse(row).data;
      if (!member || member.roles.includes(ltiTestUserRole) || (member.status ?? 'Active') !== 'Active') continue;
      if (people.size >= maxMembers && !people.has(member.user_id)) return { people: [...people.values()], issue: 'too_many_members' };
      people.set(member.user_id, member);
    }
    pages += 1;
    const next = nextLink(response.headers.get('Link'), page);
    if (!next) return { people: [...people.values()], issue: null };
    const trusted = trustedMembershipsUrl(connection, next, first);
    if (!trusted) return { refusal: 'address_refused' };
    page = trusted;
  }
  return { people: [...people.values()], issue: 'too_many_members' };
};

/**
 * The members of an LTI context at a platform, read by NRPS 2.0 page by page with the connection's token. Nothing is
 * signed or sent unless the token's addresses (`platformTokenAddresses`) and each page (`trustedMembershipsUrl`) lie on
 * the connection's issuer's origin. A member that fails validation, names a test user or is not active is left out,
 * and a person listed twice counts once. A 401 gets one new token. The read stops at `maxMembersPages` pages or
 * `maxMembers` people.
 * @returns The people, with `too_many_members` when the platform lists more; or the refusal of the token or the list,
 *   or `address_refused` for an address the app does not reach.
 * @throws AppError 400 `outbound_request_failed` for an answer that is neither a page nor a refusal, or a platform
 *   that does not answer.
 */
export const readLtiMembers = async (
  connection: LtiConnection,
  membershipsUrl: string,
  options: PlatformFetchOptions = {},
): Promise<MembersOutcome> => {
  const first = trustedMembershipsUrl(connection, membershipsUrl);
  const addresses = platformTokenAddresses({ issuer: connection.issuer, ...connection.config });
  if (!first || !addresses) return { refusal: 'address_refused' };
  return readMemberPages(connection, addresses, first, options).catch((error: unknown) => {
    // The guarded fetch refuses an address for good, unlike a platform that failed to answer.
    if (error instanceof AppError && error.type === 'outbound_request_refused') return { refusal: 'address_refused' as const };
    throw error;
  });
};
