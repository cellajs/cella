import { sql } from 'drizzle-orm';
import type { Context, Next } from 'hono';
import { appConfig } from 'shared';
import { vi } from 'vitest';
import { getAdminDb } from '#/db/db';
import { resetOrganizationMockEnforcers } from '#/modules/organization/organization-mocks';
import { resetUserMockEnforcers } from '#/modules/user/user-mocks';
import { overrideConfig } from './fixtures';

type AuthStrategy = 'passkey' | 'oauth' | 'totp' | 'magic' | 'sso';
type OAuthProvider = 'github' | 'google' | 'microsoft';

type ConfigOverride = { enabledAuthStrategies?: AuthStrategy[]; enabledOAuthProviders?: OAuthProvider[]; selfRegistration?: boolean };

/** Empties the auth tables and everything that references them, plus a mock-enforcer reset so unique values do not conflict across tests. */
export async function clearDatabase() {
  resetUserMockEnforcers();
  resetOrganizationMockEnforcers();

  await emptyTables([
    'sessions',
    'tokens',
    'passkeys',
    'identities',
    'emails',
    'users',
    'api_keys',
    'service_accounts',
    'actors',
    'oidc_payloads',
    'oauth_clients',
  ]);
}

/** Per root list: the roots and every table a chain of foreign keys ties to them, the set `TRUNCATE ... CASCADE` reaches. */
const cascadeSets = new Map<string, string[]>();

/**
 * Empties `roots` and every table referencing them, on the admin connection (runtime_role may not). Deleting a test's
 * few rows takes ~10ms; TRUNCATE gives each of the ~25 tables new files and takes ~400ms, after every test.
 * `replica` skips row triggers and foreign key checks, as TRUNCATE does.
 */
export async function emptyTables(roots: string[]) {
  const db = getAdminDb('test cleanup');
  const key = roots.join();
  let tables = cascadeSets.get(key);
  if (!tables) {
    const { rows } = await db.execute<{ name: string }>(sql`
      WITH RECURSIVE cascade_set(oid) AS (
        SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname IN ${roots}
        UNION
        SELECT con.conrelid FROM pg_constraint con JOIN cascade_set ON con.confrelid = cascade_set.oid WHERE con.contype = 'f'
      )
      SELECT DISTINCT format('%I.%I', n.nspname, c.relname) AS name
      FROM cascade_set JOIN pg_class c ON c.oid = cascade_set.oid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE NOT c.relispartition`);
    tables = rows.map((row) => row.name);
    cascadeSets.set(key, tables);
  }
  const statements = tables.map((table) => `DELETE FROM ${table};`).join('\n');
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL session_replication_role = replica`);
    await tx.execute(sql.raw(statements));
  });
}

/** Vitest hoists vi.mock(), so call at top level: vi.mock('#/middlewares/rate-limiter/core', rateLimiterCoreMock) */
export const rateLimiterCoreMock = () => ({
  rateLimiter: vi.fn().mockImplementation((mode: string, key: string) => {
    const handler = async (_: Context, next: Next) => {
      await next();
    };
    return Object.assign(handler, { keyPrefix: `${key}_${mode}`, buckets: [] });
  }),
});

/** Use at top level: vi.mock('#/middlewares/rate-limiter/helpers', rateLimiterHelpersMock) */
export const rateLimiterHelpersMock = async (importOriginal: () => Promise<Record<string, unknown>>) => {
  const actual = await importOriginal();
  return {
    ...actual,
    checkIpRateLimitStatus: vi.fn().mockResolvedValue({ isLimited: false }),
    checkRateLimitStatus: vi.fn().mockResolvedValue({ isLimited: false }),
  };
};

/** Use at top level: vi.mock('oauth4webapi', oauth4webapiMock) */
export const oauth4webapiMock = async () => {
  const actual = await vi.importActual('oauth4webapi');
  return {
    ...actual,
    generateRandomState: () => `mock-state-${Math.random().toString(36).substring(7)}`,
    generateRandomCodeVerifier: () => `mock-code-verifier-${Math.random().toString(36).substring(7)}`,
    generateRandomNonce: () => `mock-nonce-${Math.random().toString(36).substring(7)}`,
  };
};

/** Sets the sign-in methods and self-registration for the rest of the test file. */
export function setTestConfig({ selfRegistration, ...overrides }: ConfigOverride) {
  overrideConfig(appConfig, overrides);
  if (selfRegistration !== undefined) overrideConfig(appConfig.has, { selfRegistration });
}

/**
 * In-memory cookie store standing in for the real cookie helpers.
 * Use at top level: vi.mock('#/modules/auth/general/helpers/cookie', async () => (await import('../test-utils')).cookieMock())
 * Call clearCookieStore() in afterEach; pre-populate by writing to mockCookieStore.
 */
export const mockCookieStore = new Map<string, string>();
export const clearCookieStore = () => mockCookieStore.clear();

/** An auth cookie's name as the app gives it in test mode, which is secure, so the __Host- prefix applies. */
const mockCookieName = (name: string) => `__Host-${appConfig.slug}-${name}-${appConfig.cookieVersion}`;

export const cookieMock = () => ({
  authCookieName: mockCookieName,
  // The store keeps plain values, so a sealed value is its content.
  sealAuthCookie: (_name: string, content: string) => content,
  cookieSecrets: ['test-cookie-secret-for-unit-tests'],
  setAuthCookie: vi.fn().mockImplementation(async (ctx, name, value, _maxAge) => {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    mockCookieStore.set(name, stringValue);
    ctx.res.headers.append('set-cookie', `${mockCookieName(name)}=${stringValue}; Path=/; HttpOnly; SameSite=Lax`);
  }),
  getAuthCookie: vi.fn().mockImplementation(async (_ctx, name) => {
    return mockCookieStore.get(name) || null;
  }),
  deleteAuthCookie: vi.fn().mockImplementation(async (ctx, name) => {
    mockCookieStore.delete(name);
    ctx.res.headers.append('set-cookie', `${mockCookieName(name)}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
  }),
});

/** Use at top level: vi.mock('#/modules/auth/sessions/operations/create-session', createSessionMock). The module's other exports stay real. */
export const createSessionMock = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  setUserSession: vi.fn().mockImplementation(async (ctx, _user, _provider) => {
    const sessionToken = 'mock-session-token';
    ctx.res.headers.append('set-cookie', `${mockCookieName('session')}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax`);
    return sessionToken;
  }),
});

/** Use at top level: vi.mock('#/modules/auth/sessions/operations/resolve-session', resolveSessionMock). The module's other exports stay real. */
export const resolveSessionMock = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  resolveSession: vi.fn().mockResolvedValue({ user: { id: 'test-user-id' }, session: { id: 'test-session-id' } }),
  // A request that may present no session presents none, so an emailed link opens as in a signed-out browser.
  findSession: vi.fn().mockResolvedValue(null),
});
