import type { OpenAPIHono } from '@hono/zod-openapi';
import { getMe } from 'sdk';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '#/core/context';
import { defaultHeaders } from '../fixtures';
import {
  createSystemAdminUser,
  createTestOrganization,
  createTestSession,
  createTestUser,
  expectRefusal,
} from '../helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData } from './helpers';

// Every sign-in method on, so a route's strategy gate lets the request through to the guard under test.
setTestConfig({
  enabledAuthStrategies: ['passkey', 'totp', 'oauth', 'magic'],
  enabledOAuthProviders: ['github', 'google', 'microsoft'],
});

interface Operation {
  operationId: string;
  method: string;
  path: string;
  guards: string[];
}

const httpMethods = ['get', 'post', 'put', 'patch', 'delete'] as const;

/** Every operation of the API with the guard chain it declares (`x-guard`), from the app's own OpenAPI document. */
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
        },
      ];
    }),
  );
};

/** A route of a disabled service answers 404 before any guard runs: its `serviceEnabled(<service>)` gate. */
const serviceIsOn = ({ guards }: Operation) =>
  guards.every((guard) => {
    const service = /^serviceEnabled\((\w+)\)$/.exec(guard)?.[1];
    return !service || appConfig.services[service as keyof typeof appConfig.services]?.enabled !== false;
  });

/**
 * Function-level access follows the guard chain a route declares, so the table is the API itself: every route without
 * `publicGuard` refuses a request without a session, and every route behind `sysAdminGuard` refuses a signed-in user
 * without the system role, whatever the route does. The guards run before validation, so a request needs no valid body.
 */
describe('Route guards', async () => {
  const call = await createAppClient();
  const { baseApp } = await import('#/routes');
  const operations = operationsOf(baseApp).filter(serviceIsOn);
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
    sysAdmin = {
      sessionCookie: await createTestSession(await createSystemAdminUser('route-guards-sysadmin@security-test.com')),
    };
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
    expect((await call(getMe, { headers: { ...defaultHeaders, Cookie: user.sessionCookie } })).response.status).toBe(
      200,
    );
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
});
