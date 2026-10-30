import type { OpenAPIHono } from '@hono/zod-openapi';
import { getMe } from 'sdk';
import { type ConfigSwitch, isSwitchOn } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '#/core/context';
import { defaultHeaders } from '../fixtures';
import { createSystemAdminUser, createTestOrganization, createTestSession, createTestUser, expectRefusal } from '../helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser } from './helpers';

// Every sign-in method on, so a route's config switch lets the request through to the guard under test.
setTestConfig({ enabledAuthStrategies: ['passkey', 'totp', 'oauth', 'magic', 'sso'], enabledOAuthProviders: ['github', 'google', 'microsoft'] });

interface Operation {
  operationId: string;
  method: string;
  path: string;
  guards: string[];
  rateLimiters: string[];
  enabledBy?: ConfigSwitch;
  /** The names of its path and query parameters. */
  parameters: string[];
  /** Answers with an event stream, which stays open. */
  streams: boolean;
}

const httpMethods = ['get', 'post', 'put', 'patch', 'delete'] as const;

/** Every operation of the API with its guard chain (`x-guard`), limiters and config switch (`x-enabled-by`), from the app's own OpenAPI document. */
const operationsOf = (app: OpenAPIHono<Env>): Operation[] => {
  const { paths = {} } = app.getOpenAPI31Document({ openapi: '3.1.0', info: { title: 'guards', version: '0' } });
  return Object.entries(paths).flatMap(([path, item]) =>
    httpMethods.flatMap((method) => {
      const operation = item[method];
      if (!operation) return [];
      return [
        {
          operationId: String(operation.operationId),
          method: method.toUpperCase(),
          path,
          guards: (operation['x-guard'] as string[] | undefined) ?? [],
          rateLimiters: (operation['x-rate-limiter'] as string[] | undefined) ?? [],
          enabledBy: operation['x-enabled-by'] as ConfigSwitch | undefined,
          parameters: (operation.parameters ?? []).flatMap((parameter) => ('name' in parameter ? [parameter.name] : [])),
          streams: Object.values(operation.responses ?? {}).some((response) => 'content' in response && !!response.content?.['text/event-stream']),
        },
      ];
    }),
  );
};

/**
 * Routes that take a write or an anonymous request without a limiter, each with what bounds the work one request causes.
 * A route an app adds to this list names that bound the same way.
 */
const routesWithoutLimiter: Record<string, string> = {
  getAuthHealth: 'a primary-key read of one bucket and the active federations',
  getPendingMfa: "reads the browser's own confirm-mfa token and writes nothing",
  signOut: "ends only the caller's own session",
  github: 'a redirect and a state cookie',
  google: 'a redirect and a state cookie',
  microsoft: 'a redirect and a state cookie',
  getSsoEntry: 'one read by connection id',
  startSso: 'a redirect; the discovery fetch is shared while in flight and goes to a configured issuer',
  startSsoFederation: 'a redirect; the discovery fetch is shared while in flight and goes to a configured issuer',
  getPublicCounts: 'counted at most once a minute per process',
  getApiProtectedResourceMetadata: 'static JSON from the path, no database',
  getMcpProtectedResourceMetadata: 'static JSON from the path, no database',
  startImpersonation: 'system admins only',
  stopImpersonation: 'needs an impersonation session and writes that one session',
  markNotificationsRead: "one update of at most 200 of the caller's own rows, idempotent",
  updateNotificationPreferences: "one row of the caller's own",
  deletePushSubscription: "deletes the caller's own row only",
};

/** A route whose config switch is off is refused before any guard runs (`x-enabled-by`). */
const switchIsOn = ({ enabledBy }: Operation) => !enabledBy || isSwitchOn(enabledBy);

/**
 * Function-level access follows the guard chain a route declares, so the table is the API itself: every route without
 * `publicGuard` refuses a request without a session, and every route behind `sysAdminGuard` refuses a signed-in user
 * without the system role, whatever the route does. The guards run before validation, so a request needs no valid body.
 */
describe('Route guards', async () => {
  const call = await createAppClient();
  const { baseApp } = await import('#/routes');
  const operations = operationsOf(baseApp).filter(switchIsOn);
  const nonPublic = operations.filter(({ guards }) => !guards.includes('publicGuard'));
  const sysAdminOnly = operations.filter(({ guards }) => guards.includes('sysAdminGuard'));

  let tenant: { id: string; organizationId: string };
  let user: { sessionCookie: string };
  let sysAdmin: { sessionCookie: string };

  /** The path with its parameters filled in: the tenant and organization exist, every other id names nothing. */
  const pathOf = ({ path }: Operation) =>
    path
      .replace('{tenantId}', tenant.id)
      .replace('{organizationId}', tenant.organizationId)
      .replace(/\{[^}]+\}/g, () => generateId());

  const request = (operation: Operation, cookie?: string) =>
    baseApp.request(pathOf(operation), {
      method: operation.method,
      headers: cookie ? { ...defaultHeaders, Cookie: cookie } : defaultHeaders,
      body: operation.method === 'GET' ? undefined : '{}',
    });

  const nameOf = ({ method, path, operationId }: Operation) => `${method} ${path} (${operationId})`;

  beforeAll(async () => {
    const organization = await createTestOrganization();
    tenant = { id: organization.tenantId, organizationId: organization.id };
    user = { sessionCookie: await createTestSession(await createTestUser('route-guards-user@security-test.com')) };
    sysAdmin = { sessionCookie: await createTestSession(await createSystemAdminUser('route-guards-sysadmin@security-test.com')) };
  });

  afterAll(async () => await clearSecurityTestData());

  it('reads the guard chain of every route from the document', () => {
    // An empty table would pass vacuously: the routes known to sit behind each guard must be in it.
    expect(nonPublic.map(({ operationId }) => operationId)).toEqual(expect.arrayContaining(['getMe', 'getTenants']));
    expect(sysAdminOnly.map(({ operationId }) => operationId)).toEqual(expect.arrayContaining(['getTenants']));
    expect(sysAdminOnly.length).toBeGreaterThanOrEqual(13);
  });

  it('must not reach any non-public route via a request without a session', async () => {
    for (const operation of nonPublic) {
      const { status } = await request(operation);
      expect(status, nameOf(operation)).toBe(401);
    }
    // Positive control: a session reaches a route behind userGuard.
    expect((await call(getMe, { headers: { ...defaultHeaders, Cookie: user.sessionCookie } })).response.status).toBe(200);
  });

  it('must not reach any system-admin route via a session without the system role', async () => {
    for (const operation of sysAdminOnly) {
      await expectRefusal(await request(operation, user.sessionCookie), 403, 'no_sysadmin', nameOf(operation));
    }
    // Positive control: the system role passes the guard on every one of them (validation may still refuse the body).
    for (const operation of sysAdminOnly) {
      const { status } = await request(operation, sysAdmin.sessionCookie);
      expect(status, nameOf(operation)).not.toBe(403);
    }
  });

  it('must not take a write or an anonymous request on a route without a limiter, unless the list names its bound', () => {
    // Every route, switched off ones included: a limiter belongs to the route whatever the config.
    const unlimited = operationsOf(baseApp).filter(
      ({ method, guards, rateLimiters }) => (method !== 'GET' || guards.includes('publicGuard')) && rateLimiters.length === 0,
    );
    for (const operation of unlimited) {
      expect(
        routesWithoutLimiter[operation.operationId],
        `${nameOf(operation)} takes requests without a limiter: give it xRateLimiter, or add it to routesWithoutLimiter with what bounds its cost`,
      ).toBeDefined();
    }
    const stale = Object.keys(routesWithoutLimiter).filter((operationId) => !unlimited.some((operation) => operation.operationId === operationId));
    expect(stale, 'these routesWithoutLimiter entries name a route that has a limiter now, or no route: drop them').toEqual([]);
  });

  it('must not list or read by another user without the guard that relates the caller to that user', () => {
    const relatable = operations.filter(({ parameters }) => parameters.includes('relatableUserId'));
    expect(relatable.map(({ operationId }) => operationId)).toEqual(expect.arrayContaining(['getUser', 'getOrganizations']));
    for (const operation of relatable) expect(operation.guards, nameOf(operation)).toContain('relatableGuard');
  });

  it('must not answer an organization member with a server error, whatever the ids name', async () => {
    // A route that reads a scope its guard chain never set fails here before it reads a row: its guards let the member
    // in, and the ids beyond the tenant and the organization name nothing. This reaches the handler of a read and of a
    // write that takes no body; a write that validates its body stops at 400 before it. An open stream is left out.
    const swept = nonPublic.filter(({ streams }) => !streams);
    let reached = 0;
    for (const [index, operation] of swept.entries()) {
      // A member per route: one of them deletes the account it is called with.
      const member = await createOrgUser(call, tenant.id, tenant.organizationId, `route-guards-member-${index}`);
      const { status } = await request(operation, member.sessionCookie);
      expect(status, nameOf(operation)).toBeLessThan(500);
      if (status !== 401) reached++;
    }
    // The sweep ran signed in: a session passes every guard chain but the ones that take a token or a key alone.
    expect(reached).toBeGreaterThan(swept.length / 2);
  });

  it('must not answer a server error for a NUL character in any parameter of a path', async () => {
    // Postgres refuses a NUL in a text value (SQLSTATE 22021), and a guard or a handler reads a path id before any
    // schema does. No such id names a row, so one member serves every route.
    const member = await createOrgUser(call, tenant.id, tenant.organizationId, 'route-guards-nul-member');
    const nul = encodeURIComponent('x\u0000y');
    const withParameters = nonPublic.filter(({ path, streams }) => !streams && path.includes('{'));
    expect(withParameters.length).toBeGreaterThan(20);

    for (const operation of withParameters) {
      for (const [parameter] of operation.path.matchAll(/\{[^}]+\}/g)) {
        const path = pathOf({ ...operation, path: operation.path.replace(parameter, nul) });
        const { status } = await baseApp.request(path, {
          method: operation.method,
          headers: { ...defaultHeaders, Cookie: member.sessionCookie },
          body: operation.method === 'GET' ? undefined : '{}',
        });
        expect(status, `${nameOf(operation)} with a NUL in ${parameter}`).toBeLessThan(500);
      }
    }
  });
});
