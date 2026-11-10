import { createDemo } from 'sdk';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultHeaders, overrideConfig } from '../fixtures';
import { setCookiePair } from '../helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData } from './helpers';

overrideConfig(appConfig.has, { demos: true });

afterEach(clearSecurityTestData);

const httpMethods = ['get', 'post', 'patch', 'delete'] as const;

type Operation = { operationId?: string; 'x-guard'?: string[]; 'x-anonymous'?: boolean; 'x-enabled-by'?: unknown };
type UserLevelOperation = { operationId: string; method: string; path: string; admits: boolean; switched: boolean };

/** What the switch gate answers, before any guard, for a route whose switch is off in the test config. */
const switchedOff = new Set(['route_not_found', 'forbidden_strategy', 'unsupported_oauth']);

/** Every operation that authenticates a session and binds it to no tenant, read from the app's own document: the gate's domain. */
const userLevelOperations = async (): Promise<UserLevelOperation[]> => {
  const { baseApp } = await import('#/routes');
  const { paths = {} } = baseApp.getOpenAPI31Document({ openapi: '3.1.0', info: { title: 'gate', version: '0' } });
  return Object.entries(paths).flatMap(([path, item]) =>
    httpMethods.flatMap((method) => {
      const operation = item?.[method] as Operation | undefined;
      const guards = operation?.['x-guard'] ?? [];
      const authenticates = guards.includes('userGuard') || guards.includes('actorGuard');
      if (!operation || !authenticates || guards.includes('tenantGuard')) return [];
      const admits = operation['x-anonymous'] === true;
      return [{ operationId: String(operation.operationId), method, path, admits, switched: operation['x-enabled-by'] !== undefined }];
    }),
  );
};

/**
 * An anonymous session (a demo's) reaches a tenant's routes through its memberships, and beyond them only the routes
 * that admit it. The table is the API itself: a new user-level route refuses such a session until it carries
 * `xAnonymous`, and a route that carries it must let one through.
 */
describe('Anonymous gate', async () => {
  const call = await createAppClient();
  const { baseApp } = await import('#/routes');

  it('refuses an anonymous session on every user-level operation that does not admit one, and admits the ones that do', async () => {
    const taken = await call(createDemo, { headers: { ...defaultHeaders, 'x-forwarded-for': '10.0.9.1' } });
    expect(taken.response.status).toBe(201);
    const headers = { ...defaultHeaders, Cookie: setCookiePair(taken.response, 'session') };

    const operations = await userLevelOperations();
    expect(operations.length).toBeGreaterThan(20);

    const wrong: string[] = [];
    for (const { operationId, method, path, admits, switched } of operations) {
      // The gate runs before validation, so any value stands in for a path param; a stream is aborted once its status is in.
      const controller = new AbortController();
      const response = await baseApp.request(path.replace(/\{[^}]+\}/g, 'any'), { method: method.toUpperCase(), headers, signal: controller.signal });
      const refused = response.status === 400 || response.status === 403 || response.status === 404;
      const body = refused ? ((await response.json().catch(() => undefined)) as { type?: string } | undefined) : undefined;
      controller.abort();

      const gated = response.status === 403 && body?.type === 'anonymous_session_restricted';
      const off = switched && switchedOff.has(body?.type ?? '');
      if (admits && gated) wrong.push(`${operationId} carries xAnonymous and refused the session`);
      if (!admits && !gated && !off)
        wrong.push(`${operationId} let the session through (${response.status} ${body?.type ?? ''}); give it xAnonymous when that is meant`);
    }
    expect(wrong).toEqual([]);
  });
});
