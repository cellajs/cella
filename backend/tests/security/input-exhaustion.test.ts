import { eq, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createAttachments, handleMcp, updateAttachment } from 'sdk';
import type { TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateServerHLC, hlcMaxLength } from '#/core/stx/hlc';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { resourceUri } from '#/modules/oauth-server/resources';
import { mockStxFor } from '#/schemas/sync-transaction-mocks';
import { adminRole, defaultHeaders } from '../fixtures';
import { adminDb, createTestOrganization, expectRefusal } from '../helpers';
import { attachmentBody, cleanupEntityHierarchy, seedAttachmentHome } from '../hierarchy-helpers';
import {
  bearerHeaders,
  clientCredentialsToken,
  serveClientMetadataDocuments,
  serviceAccountWithKey,
  startAuthorization,
  startTestOauthServer,
  type TestOauthServer,
} from '../oauth-helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData, createFactorOrgUser } from './helpers';

/** A timestamp a megabyte long in the HLC form: `BigInt` parses it, and every stamp the server prints after it is as long. */
const megabyteStamp = `${'9'.repeat(999_980)}:0000:abcde`;

const MiB = 1024 * 1024;

/** 19.5 MiB of empty objects: about 21 times its size in heap once parsed. */
const objectsBody = `{"email":"a@b.co","x":[${'{},'.repeat(Math.floor((19.5 * MiB) / 3))}0]}`;

/**
 * Requests whose shape costs the server more than their bytes: a body past the cap under any content type, a field
 * that a parser turns into work or a list multiplies, a batch run in series, and connects that race a cap. Each row
 * sends the attack and a rightful request beside it.
 */
describe('Input exhaustion', async () => {
  const call = await createAppClient();
  const { baseApp: app } = await import('#/routes');
  let oauth: TestOauthServer;
  let org: { id: string; tenantId: string };
  let user: { id: string; sessionCookie: string };
  let plan: TestEntityHierarchyPlan;
  const created: string[] = [];

  const headers = () => ({ ...defaultHeaders, Cookie: user.sessionCookie });

  const createAttachment = async (fields: Record<string, unknown>) => {
    const id = generateId();
    created.push(id);
    const result = await call(createAttachments, {
      path: { tenantId: org.tenantId, organizationId: org.id },
      body: [attachmentBody(id, plan, fields)],
      headers: headers(),
    });
    return { ...result, id };
  };

  beforeAll(async () => {
    oauth = await startTestOauthServer();
    org = await createTestOrganization();
    user = await createFactorOrgUser(call, org.tenantId, org.id, `exhaustion-${nanoid(8)}`, adminRole);
    plan = await seedAttachmentHome(org, user.id);
  });

  afterAll(async () => {
    await oauth.close();
    if (created.length) await adminDb.delete(attachmentsTable).where(inArray(attachmentsTable.id, created));
    await cleanupEntityHierarchy(adminDb, plan);
    await clearSecurityTestData();
  });

  it('must not let a megabyte HLC stamp into the server clock via a create', async () => {
    const stx = (stamp: string) => ({ stx: { mutationId: generateId(), sourceId: 'exhaustion', fieldTimestamps: { name: stamp } } });

    await expectRefusal(await createAttachment(stx(megabyteStamp)), 400, 'form.too_big');
    expect(generateServerHLC().length).toBeLessThanOrEqual(hlcMaxLength);

    const rightful = await createAttachment(stx(generateServerHLC('client')));
    expect(rightful.response.status).toBe(201);
  });

  it('must not take the server clock from a megabyte stamp a row already holds', async () => {
    const { id, response } = await createAttachment({});
    expect(response.status).toBe(201);
    const [row] = await adminDb.select({ stx: attachmentsTable.stx }).from(attachmentsTable).where(eq(attachmentsTable.id, id));
    await adminDb
      .update(attachmentsTable)
      .set({ stx: { ...row.stx, fieldTimestamps: { name: megabyteStamp } } })
      .where(eq(attachmentsTable.id, id));

    const renamed = await call(updateAttachment, {
      path: { tenantId: org.tenantId, organizationId: org.id, id },
      body: { ops: { name: 'Renamed' }, stx: mockStxFor('name') },
      headers: headers(),
    });
    expect(renamed.response.status).toBe(200);
    expect(generateServerHLC().length).toBeLessThanOrEqual(hlcMaxLength);
    // The rename replaced the stored stamp.
    const [after] = await adminDb.select({ stx: attachmentsTable.stx }).from(attachmentsTable).where(eq(attachmentsTable.id, id));
    expect(after.stx.fieldTimestamps.name.length).toBeLessThanOrEqual(hlcMaxLength);
  });

  it.each([
    ['application/x+json; a=multipart/form-data', true],
    ['APPLICATION/JSON; a=multipart/form-data', false],
    ['application/vnd.x+json;b=multipart/form-data', true],
    ['multipart/form-data', false],
  ])('must not read a body past the cap before sign-in via the content type %s', async (contentType, declaresLength) => {
    const sent = new Headers({ ...defaultHeaders, 'Content-Type': contentType });
    if (declaresLength) sent.set('Content-Length', String(Buffer.byteLength(objectsBody)));
    const response = await app.request('/auth/check-email', { method: 'POST', headers: sent, body: objectsBody });
    await expectRefusal(response, 413, 'body_too_large');
  });

  it('answers a JSON body within the cap before sign-in (positive control)', async () => {
    const response = await app.request('/auth/check-email', {
      method: 'POST',
      headers: defaultHeaders,
      body: JSON.stringify({ email: 'a@b.co' }),
    });
    expect(response.status).toBe(200);
  });

  it('must not read a consent decision past the cap', async () => {
    const clientId = 'https://exhaustion-client.example/metadata.json';
    const redirectUri = 'http://localhost:9999/callback';
    const restore = serveClientMetadataDocuments({
      [clientId]: {
        client_name: 'Exhaustion client',
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code'],
        response_types: ['code'],
      },
    });
    try {
      const resource = resourceUri({ face: 'mcp', tenantId: org.tenantId, organizationId: org.id });
      const { browser, uid } = await startAuthorization(oauth.issuer, {
        clientId,
        redirectUri,
        scope: 'attachment:read',
        resource,
        sessionCookie: user.sessionCookie,
      });
      const decide = (body: string) =>
        fetch(`${new URL(oauth.issuer).origin}/oauth/interaction/${uid}/consent`, {
          method: 'POST',
          headers: { Cookie: browser.header(), 'Content-Type': 'application/json' },
          body,
        });

      await expectRefusal(await decide(JSON.stringify({ accept: true, x: 'a'.repeat(2 * MiB) })), 413, 'body_too_large');
      expect((await decide(JSON.stringify({ accept: true }))).status).toBe(200);
    } finally {
      restore();
    }
  });

  it('must not run an MCP batch of ten thousand calls', async () => {
    const client = await serviceAccountWithKey(org, user.sessionCookie);
    const resource = resourceUri({ face: 'mcp', tenantId: org.tenantId, organizationId: org.id });
    const token = await clientCredentialsToken(oauth.issuer, client, { scope: 'attachment:read', resource });
    const batch = (size: number) =>
      call(handleMcp, {
        path: { tenantId: org.tenantId, organizationId: org.id },
        body: Array.from({ length: size }, (_, id) => ({ jsonrpc: '2.0', id, method: 'tools/list' })),
        headers: bearerHeaders(String(token.body.access_token)),
      });

    await expectRefusal(await batch(10_000), 400, 'form.custom');
    const rightful = await batch(2);
    expect(rightful.response.status).toBe(200);
    expect(rightful.data).toHaveLength(2);
  });

  it('must not store a megabyte storage key', async () => {
    // A local original skips the bucket check, so a variant key under the uploader's own prefix is stored as sent.
    const keys = (name: string) => ({ keys: { original: '', preview: `${org.id}/${user.id}/${name}` } });
    await expectRefusal(await createAttachment(keys('k'.repeat(1_000_000))), 400, 'form.too_big');
    expect((await createAttachment(keys('preview.webp'))).response.status).toBe(201);
  });

  it('must not open more streams than the per-user cap via parallel connects', async () => {
    const connect = () => app.request('/entities/app/stream', { headers: headers() });
    // Cancelling a body is the client leaving: the stream ends and frees its slot.
    const leave = (responses: Response[]) => Promise.all(responses.map((response) => response.body?.cancel()));

    // The cap as one connect after another meets it.
    const sequential: Response[] = [];
    while (sequential.length < 100 && (sequential.at(-1)?.status ?? 200) === 200) sequential.push(await connect());
    await expectRefusal(sequential[sequential.length - 1], 429, 'too_many_requests');
    const cap = sequential.length - 1;
    await leave(sequential);

    const parallel = await Promise.all(Array.from({ length: cap * 3 }, connect));
    expect(parallel.filter((response) => response.status === 200)).toHaveLength(cap);
    for (const response of parallel.filter((answer) => answer.status !== 200)) await expectRefusal(response, 429, 'too_many_requests');
    await leave(parallel);
  });
});
