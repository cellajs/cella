import type { z } from '@hono/zod-openapi';
import { decodeBase32 } from '@oslojs/encoding';
import { and, eq } from 'drizzle-orm';
import { appConfig, type EntityRole, type TokenType } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { nanoid } from 'shared/utils/nanoid';
import { expect, vi } from 'vitest';
import { baseDb as db, getAdminDb } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { mockPastIsoDate } from '#/mocks';
import { authCookieName, type CookieName, sealAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { newSessionToken } from '#/modules/auth/general/helpers/session';
import { type InsertIdentityModel, identitiesTable } from '#/modules/auth/identities-db';
import { type AuthStrategy, type SessionTypes, sessionsTable } from '#/modules/auth/sessions-db';
import { type InsertTokenModel, tokensTable } from '#/modules/auth/tokens-db';
import { generateTOTP } from '#/modules/auth/totps/helpers/totp-core';
import { encryptTotpSecret } from '#/modules/auth/totps/helpers/totp-secret-encryption';
import { totpsTable } from '#/modules/auth/totps/totps-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { type OrganizationModel, organizationsTable } from '#/modules/organization/organization-db';
import { mockOrganization } from '#/modules/organization/organization-mocks';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { emailsTable } from '#/modules/user/emails-db';
import { insertUsers } from '#/modules/user/helpers/insert-users';
import { type UserModel, usersTable } from '#/modules/user/user-db';
import { mockEmail, mockUser } from '#/modules/user/user-mocks';
import type { apiErrorSchema } from '#/schemas';
import { hashToken } from '#/utils/hash-token';
import { adminRole, defaultHeaders } from './fixtures';

export type ErrorResponse = z.infer<typeof apiErrorSchema>;

/**
 * The admin connection, past RLS: tests arrange and assert rows under RLS on it, so a runtime_role run of the suite
 * sees every row its own `db` would hide.
 */
export const adminDb = getAdminDb('test setup');

/** What a request left the test: the raw response, an SDK result, or a local helper's status and parsed body. */
type Answer = Response | { response: Response; error?: unknown } | { status: number; body?: unknown };

/**
 * Asserts the app refused with exactly this status and error type, in one comparison so a failure shows both. A raw
 * response's body is read from a clone, so the test can still read it. A raw response is told by its shape: a
 * `fetch` answer is no instance of the `Response` the node server installs globally.
 */
export async function expectRefusal(answer: Answer, status: number, type: string, label?: string) {
  const unreadable = () => undefined;
  const [actual, body] =
    'response' in answer
      ? [answer.response.status, answer.error]
      : 'clone' in answer
        ? [answer.status, await answer.clone().json().catch(unreadable)]
        : [answer.status, answer.body];
  expect({ status: actual, type: (body as { type?: unknown } | undefined)?.type }, label).toEqual({ status, type });
}

/** Every mail the app handed the mailer in this test, one per recipient, in the order sent. */
export const sentMails = () =>
  vi.mocked(mailer.prepareEmails).mock.calls.flatMap(([template, statics, recipients]) =>
    recipients.map((recipient) => ({
      template,
      statics: statics as Record<string, unknown>,
      recipient: recipient as Record<string, unknown> & { email: string },
    })),
  );

export const mailsTo = (email: string) => sentMails().filter(({ recipient }) => recipient.email === email);

/**
 * The link `key` names in the last mail, a static prop (`stepUpUrl`) or a recipient field (`inviteLink`), and the raw
 * token at its end.
 */
export function mailedLink(key: string) {
  const last = sentMails().at(-1);
  const url = last?.statics[key] ?? last?.recipient[key];
  if (typeof url !== 'string') throw new Error(`The last mail carries no ${key}`);
  const token = url.split('/').at(-1) ?? '';
  expect(token, url).not.toBe('');
  return { url, token };
}

/** The parts of an error answer that come from the refusal itself, without the per-request path, id and time. */
export const refusalOf = ({ status, type, name, message, severity, entityType, meta }: ErrorResponse) => ({
  status,
  type,
  name,
  message,
  severity,
  entityType,
  meta,
});

/**
 * A request past the SDK from a browser holding `cookie`, its answer read as raw JSON: the SDK's response parsing would
 * hide a field the schema does not declare.
 */
export async function rawJsonRequest(path: string, cookie: string, init: { method?: string; body?: unknown } = {}) {
  const { baseApp } = await import('#/routes');
  const response = await baseApp.request(path, {
    method: init.method,
    headers: { ...defaultHeaders, Cookie: cookie },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return { status: response.status, body: await response.json() };
}

/** User with a verified email, for OAuth/passkey tests. */
export async function createUser(email: string) {
  const userRecord = mockUser({ email });
  const [user] = await insertUsers(db, [userRecord]);
  await db.insert(emailsTable).values(mockEmail(user));
  return user;
}

/** A second-factor challenge for `user`, as a first factor leaves it; returns the raw value its cookie carries. */
export async function createMfaToken(user: { id: string; email: string }) {
  return (await insertTestToken('confirm-mfa', user, { expiresInMs: 10 * 60 * 1000 })).raw;
}

/** The Base32 authenticator secret `createTotpUser` stores. */
export const testTotpSecret = 'JBSWY3DPEHPK3PXP';

/** The authenticator code for `secret` in the time step `stepsAhead` steps from now (0: the current code). */
export const totpCode = (secret = testTotpSecret, stepsAhead = 0) => {
  const { intervalInSeconds, digits } = appConfig.totp;
  const now = Math.floor(Date.now() / 1000);
  return generateTOTP(decodeBase32(secret), intervalInSeconds, digits, now + stepsAhead * intervalInSeconds);
};

/** The current code with its first digit changed. */
export const wrongTotpCode = (secret = testTotpSecret) =>
  totpCode(secret).replace(/^./, (digit) => String((Number(digit) + 5) % 10));

export async function createTotpUser(email: string) {
  const user = await createTestUser(email);
  await verifyUserEmail(email);
  await db.insert(totpsTable).values({
    userId: user.id,
    secret: encryptTotpSecret(testTotpSecret),
    createdAt: mockPastIsoDate(),
  });
  await enableMFAForUser(user.id);
  return user;
}

export async function createTestUser(email: string, verified = true) {
  const userRecord = mockUser({ email });
  const [user] = await insertUsers(db, [userRecord]);

  const emailRecord = {
    email: user.email,
    userId: user.id,
    verified,
    verifiedAt: verified ? mockPastIsoDate() : null,
  };
  await db.insert(emailsTable).values(emailRecord);

  return user;
}

export async function getUserByEmail(email: string): Promise<UserModel[]> {
  return await db.select().from(usersTable).where(eq(usersTable.email, email));
}

export async function enableMFAForUser(userId: string) {
  await db.update(usersTable).set({ mfaRequired: true }).where(eq(usersTable.id, userId));
}

export async function verifyUserEmail(email: string) {
  await db
    .update(emailsTable)
    .set({ verified: true, verifiedAt: mockPastIsoDate() })
    .where(eq(emailsTable.email, email.toLowerCase()));
}

export async function createSystemAdminUser(email: string, verified = true) {
  const user = await createTestUser(email, verified);

  // system_roles is admin-only (read-only grant + admin-only write trigger for runtime_role).
  await getAdminDb('test setup').insert(systemRolesTable).values({
    id: user.id,
    userId: user.id,
    role: 'admin',
    createdAt: mockPastIsoDate(),
  });

  return user;
}

export async function createOrganizationAdminUser(
  email: string,
  organizationId?: string,
  role: EntityRole = adminRole,
  verified = true,
  tenantId = 'test01', // Default test tenant
) {
  const user = await createTestUser(email, verified);

  const membership = {
    id: generateId(),
    userId: user.id,
    channelId: organizationId || '',
    organizationId: organizationId || '',
    tenantId,
    channelType: 'organization' as const,
    role,
    displayOrder: 1,
    createdAt: mockPastIsoDate(),
    createdBy: user.id,
  };

  await db.insert(membershipsTable).values([membership]);

  return user;
}

export async function parseResponse<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

/** The tenant is created first; the FK constraint requires it. */
export async function createTestOrganization(
  overrides?: Partial<ReturnType<typeof mockOrganization>>,
): Promise<OrganizationModel> {
  const [tenant] = await db.insert(tenantsTable).values({ name: 'Test Tenant' }).returning();

  const orgData = mockOrganization();
  const [organization] = await db
    .insert(organizationsTable)
    .values({ ...orgData, ...overrides, tenantId: tenant.id })
    .returning();

  return organization;
}

interface TestSessionOpts {
  type?: SessionTypes;
  authStrategy?: AuthStrategy;
  /** Backdates the session's creation, e.g. past the step-up window. */
  ageMs?: number;
  expiresInMs?: number;
  /** For an impersonation: the admin session it is layered on. */
  impersonatorSessionId?: string;
}

/**
 * Inserts a session row as a sign-in stores it: the random token goes in the cookie, the row keeps its hash. Returns
 * the row id, the token and the signed `Cookie` pair that presents it.
 */
export async function insertTestSession(
  user: { id: string },
  {
    type = 'regular',
    authStrategy = 'passkey',
    ageMs = 0,
    expiresInMs = 7 * 24 * 60 * 60 * 1000,
    impersonatorSessionId,
  }: TestSessionOpts = {},
) {
  const { token, secret } = newSessionToken();
  const id = generateId();

  await db.insert(sessionsTable).values({
    id,
    secret,
    userId: user.id,
    type,
    authStrategy,
    createdAt: new Date(Date.now() - ageMs).toISOString(),
    expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
    impersonatorSessionId,
  });

  const cookieName = type === 'impersonation' ? 'impersonation' : 'session';
  return { id, token, cookie: authCookie(cookieName, token, 7 * 24 * 60 * 60) };
}

/** Inserts a session row and returns the cookie string for test requests. */
export async function createTestSession(user: { id: string }, opts?: TestSessionOpts) {
  return (await insertTestSession(user, opts)).cookie;
}

/** Every session row of a user, the ended ones included. */
export const sessionsOf = (userId: string) => db.select().from(sessionsTable).where(eq(sessionsTable.userId, userId));

export const sessionRow = async (id: string) =>
  (await db.select().from(sessionsTable).where(eq(sessionsTable.id, id)).limit(1))[0];

interface TestTokenOpts extends Partial<InsertTokenModel> {
  /** From now; negative for a token that already expired. Default 15 minutes, a magic link's lifetime. */
  expiresInMs?: number;
  /** Stamps the row as a link opened in a browser that holds this single-use value, as opening it does. */
  openedWith?: string;
}

/**
 * Inserts a token row as issuing stores it: the raw value goes in the link or cookie, the row keeps its hash. The row
 * names `owner`'s address, and its account too when `owner` has an id. Returns the row and the raw value.
 */
export async function insertTestToken(
  type: TokenType,
  owner: { id?: string | null; email: string },
  { expiresInMs = 15 * 60 * 1000, openedWith, ...columns }: TestTokenOpts = {},
) {
  const raw = nanoid(40);
  const [row] = await db
    .insert(tokensTable)
    .values({
      type,
      secret: hashToken(raw),
      email: owner.email,
      userId: owner.id ?? null,
      createdBy: owner.id ?? null,
      expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
      ...(openedWith && { invokedAt: new Date().toISOString(), singleUseToken: hashToken(openedWith) }),
      ...columns,
    })
    .returning();
  return { raw, row };
}

export const tokenRow = async (id: string) => (await db.select().from(tokensTable).where(eq(tokensTable.id, id)))[0];

/** The row of `type` a raw token value names, found by its hash as the server finds it; undefined once it is spent. */
export const tokenRowOf = async (type: TokenType, raw: string) =>
  (
    await db
      .select()
      .from(tokensTable)
      .where(and(eq(tokensTable.type, type), eq(tokensTable.secret, hashToken(raw))))
  )[0];

/** A `Cookie` header pair for an auth cookie, signed like the app signs it (every mode signs). */
export function authCookie(name: CookieName, content: string, maxAgeSeconds = 60 * 60) {
  return `${authCookieName(name)}=${encodeURIComponent(sealAuthCookie(name, content, maxAgeSeconds))}`;
}

/** One Set-Cookie line (or `Cookie` pair) as a browser reads it: a past expiry or an empty value leaves no cookie. */
const readSetCookie = (line: string) => {
  const [pair, ...attributes] = line.split(';');
  const index = pair.indexOf('=');
  const name = index > 0 ? pair.slice(0, index).trim() : '';
  const value = pair.slice(index + 1).trim();
  const removed = !value || attributes.some((attribute) => /^\s*(max-age=0|expires=.*1970)/i.test(attribute));
  return { name, pair: `${name}=${value}`, line, removed };
};

/** The last Set-Cookie line a response sent for the auth cookie `name`, which is the one the browser keeps. */
const lastSetCookie = (response: Response, name: CookieName) =>
  response.headers
    .getSetCookie()
    .map(readSetCookie)
    .filter((cookie) => cookie.name === authCookieName(name))
    .at(-1);

/** What a response did to the auth cookie `name`: `set` it, `cleared` it, or left it alone (undefined). */
export function cookieChange(response: Response, name: CookieName): 'set' | 'cleared' | undefined {
  const cookie = lastSetCookie(response, name);
  if (!cookie) return undefined;
  return cookie.removed ? 'cleared' : 'set';
}

/** The `name` cookie a response set, as its whole Set-Cookie line and the `Cookie` pair; throws when it set none. */
export function setCookieOf(response: Response, name: CookieName) {
  const cookie = lastSetCookie(response, name);
  if (!cookie || cookie.removed) throw new Error(`The response set no ${name} cookie`);
  return cookie;
}

export const setCookiePair = (response: Response, name: CookieName) => setCookieOf(response, name).pair;

/**
 * One browser's cookies, path-blind (the server never minds receiving extras): each Set-Cookie line replaces the pair
 * of its name, and a cookie a response removes leaves the jar, as it leaves a browser.
 */
export class CookieJar {
  private readonly cookies = new Map<string, string>();
  /** Each initial entry is a `Cookie` header: one pair, or several joined by `; `. */
  constructor(initial: string[] = []) {
    for (const header of initial) this.add(header);
  }
  /** Puts the pairs of a `Cookie` header in the jar, as a browser that already holds them. */
  add(cookieHeader: string) {
    for (const pair of cookieHeader.split('; ')) this.store(pair);
  }
  private store(line: string) {
    const { name, pair, removed } = readSetCookie(line);
    if (!name) return;
    if (removed) this.cookies.delete(name);
    else this.cookies.set(name, pair);
  }
  absorb(response: Response) {
    for (const line of response.headers.getSetCookie()) this.store(line);
    return this;
  }
  header() {
    return [...this.cookies.values()].join('; ');
  }
}

/** The `Cookie` header a browser holding `cookieHeader` sends after `response`. */
export const cookiesAfter = (cookieHeader: string, response: Response) =>
  new CookieJar([cookieHeader]).absorb(response).header();

/** Links an external identity to a user; by default a verified GitHub identity asserting the user's own address. */
export async function linkIdentity(user: { id: string; email: string }, overrides: Partial<InsertIdentityModel> = {}) {
  const [identity] = await db
    .insert(identitiesTable)
    .values({
      userId: user.id,
      issuer: 'github',
      subject: 'github-user-id',
      email: user.email,
      verified: true,
      createdAt: mockPastIsoDate(),
      ...overrides,
    })
    .returning();
  return identity;
}
