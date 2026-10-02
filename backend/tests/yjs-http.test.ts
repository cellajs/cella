import { pullYjsDocument, pushYjsUpdate } from 'sdk';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { YJS_HTTP_CHUNK_BYTES } from '#/modules/yjs/helpers/yjs-log';
import { defaultHeaders } from './fixtures';
import { expectRefusal, rawJsonRequest } from './helpers';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './security/helpers';
import { createAppClient } from './test-client';
import { setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

/**
 * Yjs over HTTP: a client that cannot reach the relay pulls and pushes through the API. The routes are defined and
 * guarded; their operations follow, and until then they answer 501.
 */
describe.skipIf(appConfig.services.yjs.enabled === false)('Yjs over HTTP routes', async () => {
  const call = await createAppClient();
  let owner: TestTenant;

  const scope = () => ({ tenantId: owner.tenantId, organizationId: owner.organization.id });
  const headers = (cookie?: string) => (cookie ? { ...defaultHeaders, Cookie: cookie } : defaultHeaders);
  // Empty base64url: the state vector and the update of an empty document.
  const pull = (cookie?: string) =>
    call(pullYjsDocument, { path: scope(), body: { entityType: 'attachment', entityId: generateId(), stateVector: 'AA' }, headers: headers(cookie) });
  const push = (cookie?: string) =>
    call(pushYjsUpdate, {
      path: scope(),
      body: { entityType: 'attachment', entityId: generateId(), generation: crypto.randomUUID(), update: 'AAA' },
      headers: headers(cookie),
    });

  beforeAll(async () => {
    owner = await createTestTenant(call, 'yjs-http-owner');
  });

  afterAll(async () => {
    await clearSecurityTestData();
  });

  it('must not pull or push without a session', async () => {
    await expectRefusal(await pull(), 401, 'unauthorized', 'pull');
    await expectRefusal(await push(), 401, 'unauthorized', 'push');
  });

  it('answers a signed-in member 501 until the operations are built (positive control: the guards let the request through)', async () => {
    const pulled = await pull(owner.sessionCookie);
    const pushed = await push(owner.sessionCookie);
    expect(pulled.response.status).toBe(501);
    expect(pushed.response.status).toBe(501);
  });

  it('must not accept an update past the 512 KB chunk, which its base64url form keeps under the 1 MB body limit', async () => {
    const pushOf = (bytes: number) =>
      rawJsonRequest(`/${owner.tenantId}/${owner.organization.id}/yjs/push`, owner.sessionCookie, {
        method: 'POST',
        body: {
          entityType: 'attachment',
          entityId: generateId(),
          generation: crypto.randomUUID(),
          update: Buffer.alloc(bytes).toString('base64url'),
        },
      });

    await expectRefusal(await pushOf(YJS_HTTP_CHUNK_BYTES + 1), 400, 'form.too_big');
    // A full chunk passes validation (positive control).
    expect((await pushOf(YJS_HTTP_CHUNK_BYTES)).status).toBe(501);
  });
});
