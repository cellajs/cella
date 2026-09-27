import { eq } from 'drizzle-orm';
import { deleteAttachments, updateAttachment } from 'sdk';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateServerHLC } from '#/core/stx';
import { materializeDescriptionOp } from '#/modules/yjs/operations/materialize-description';
import { yjsDocumentsTable, yjsUpdatesTable } from '#/modules/yjs/yjs-db';
import { mockStxBase } from '#/schemas/sync-transaction-mocks';
import { defaultHeaders } from './fixtures';
import { adminDb } from './helpers';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './security/helpers';
import { paragraph, seedAttachment } from './security/yjs-helpers';
import { createAppClient } from './test-client';
import { setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

/**
 * A collaborative document's rows outlive the relay's sessions. A description written by anything but the relay, and
 * a deleted entity, retire the document in the writing transaction, so the relay reseeds it under a new generation.
 * The Yjs tables sit under RLS, so rows are arranged and read on the admin connection.
 */
describe.skipIf(appConfig.services.yjs.enabled === false)('Yjs document retirement', async () => {
  const call = await createAppClient();
  let tenant: TestTenant;
  let attachment: Awaited<ReturnType<typeof seedAttachment>>;

  const scope = () => ({
    entityType: 'attachment' as const,
    entityId: attachment.id,
    tenantId: tenant.tenantId,
    organizationId: tenant.organization.id,
  });

  /** The document as the relay leaves it between sessions: a base row and one unwritten log row. */
  const seedDocument = async () => {
    await adminDb
      .insert(yjsDocumentsTable)
      .values({ ...scope(), state: Buffer.alloc(0) })
      .onConflictDoNothing();
    await adminDb.insert(yjsUpdatesTable).values({ ...scope(), userId: tenant.user.id, payload: Buffer.alloc(0) });
  };

  const documentRows = async () => {
    const docs = await adminDb
      .select({ generation: yjsDocumentsTable.generation })
      .from(yjsDocumentsTable)
      .where(eq(yjsDocumentsTable.entityId, attachment.id));
    const log = await adminDb
      .select({ id: yjsUpdatesTable.id })
      .from(yjsUpdatesTable)
      .where(eq(yjsUpdatesTable.entityId, attachment.id));
    return { docs: docs.length, log: log.length };
  };

  const putDescription = (description: string) =>
    call(updateAttachment, {
      path: { organizationId: tenant.organization.id, tenantId: tenant.tenantId, id: attachment.id },
      body: {
        ops: { description },
        stx: {
          ...mockStxBase(`stx:${generateId()}`),
          fieldTimestamps: { description: generateServerHLC('test-client') },
        },
      },
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });

  beforeAll(async () => {
    tenant = await createTestTenant(call, 'yjs-retire');
    attachment = await seedAttachment({
      tenantId: tenant.tenantId,
      organizationId: tenant.organization.id,
      createdBy: tenant.user.id,
      description: paragraph('original'),
    });
  });

  afterAll(async () => {
    await adminDb.delete(yjsUpdatesTable).where(eq(yjsUpdatesTable.entityId, attachment.id));
    await adminDb.delete(yjsDocumentsTable).where(eq(yjsDocumentsTable.entityId, attachment.id));
    await attachment.remove();
    await clearSecurityTestData();
  });

  it("keeps the document across the relay's own write and an update that leaves the description as it is (positive control)", async () => {
    await seedDocument();
    await materializeDescriptionOp({
      ...scope(),
      description: paragraph('written by the relay'),
      editors: [tenant.user.id],
    });
    expect(await documentRows()).toEqual({ docs: 1, log: 1 });

    const stored = (await attachment.read())?.description;
    expect(stored).toContain('written by the relay');
    const { response } = await putDescription(stored ?? '');
    expect(response.status).toBe(200);
    expect(await documentRows()).toEqual({ docs: 1, log: 1 });
  });

  it('must not keep a document whose description was written outside the relay: the update retires it', async () => {
    const { response } = await putDescription(paragraph('rewritten elsewhere'));
    expect(response.status).toBe(200);
    expect((await attachment.read())?.description).toContain('rewritten elsewhere');
    expect(await documentRows()).toEqual({ docs: 0, log: 0 });
  });

  it('must not keep the document of a deleted attachment', async () => {
    await seedDocument();
    expect(await documentRows()).toEqual({ docs: 1, log: 1 });
    const { response } = await call(deleteAttachments, {
      path: { organizationId: tenant.organization.id, tenantId: tenant.tenantId },
      body: { ids: [attachment.id], stx: { mutationId: generateId(), sourceId: 'yjs-retire' } },
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });
    expect(response.status).toBe(200);
    expect(await documentRows()).toEqual({ docs: 0, log: 0 });
  });
});
