import { eq } from 'drizzle-orm';
import { getAttachment, getOrganization, updateAttachment, updateOrganization } from 'sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { updateStamps } from '#/db/utils/stamps';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { mockStxFor } from '#/schemas/sync-transaction-mocks';
import { defaultHeaders } from './fixtures';
import { adminDb } from './helpers';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './security/helpers';
import { lockWaiters, paragraph, seedAttachment } from './security/yjs-helpers';
import { createAppClient } from './test-client';
import { setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

/**
 * A REST caller that reads a resource, changes it and writes it back sends the `ETag` it read in `If-Match`. A write
 * that landed in between, before its check or between its check and its update, answers 412 and keeps the other
 * write: the caller's change never overwrites one it did not see.
 */
describe('Conditional writes', async () => {
  const call = await createAppClient();
  let tenant: TestTenant;
  const removals: (() => Promise<void>)[] = [];

  beforeAll(async () => {
    tenant = await createTestTenant(call, 'conditional-writes');
  });

  afterAll(async () => {
    for (const remove of removals) await remove();
    await clearSecurityTestData();
  });

  const headers = (ifMatch?: string) => ({ ...defaultHeaders, Cookie: tenant.sessionCookie, ...(ifMatch && { 'If-Match': ifMatch }) });
  const orgPath = () => ({ tenantId: tenant.tenantId, organizationId: tenant.organization.id });

  const readOrganizationTag = async () => {
    const { response } = await call(getOrganization, { path: orgPath(), query: {}, headers: headers() });
    expect(response.status).toBe(200);
    return response.headers.get('etag') ?? '';
  };
  const renameOrganization = (name: string, ifMatch?: string) =>
    call(updateOrganization, { path: orgPath(), body: { name }, headers: headers(ifMatch) });
  const storedOrganizationName = async () => {
    const [row] = await adminDb
      .select({ name: organizationsTable.name })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, tenant.organization.id));
    return row.name;
  };

  it('refuses an organization update whose tag a write since has replaced', async () => {
    const tag = await readOrganizationTag();
    expect((await renameOrganization('theirs')).response.status).toBe(200);

    const { response, error } = await renameOrganization('mine', tag);
    expect(response.status).toBe(412);
    expect(error).toMatchObject({ type: 'precondition_failed' });
    expect(await storedOrganizationName()).toBe('theirs');

    const current = await readOrganizationTag();
    const written = await renameOrganization('mine', current);
    expect(written.response.status).toBe(200);
    expect(written.response.headers.get('etag')).not.toBe(current);
  });

  it('refuses an organization update when a write lands between its check and its update', async () => {
    const tag = await readOrganizationTag();

    // The other writer holds the row: the request's read and check pass, its update waits on the lock.
    const held = Promise.withResolvers<void>();
    const proceed = Promise.withResolvers<void>();
    const writer = adminDb.transaction(async (tx) => {
      await tx.select({ id: organizationsTable.id }).from(organizationsTable).where(eq(organizationsTable.id, tenant.organization.id)).for('update');
      held.resolve();
      await proceed.promise;
      await tx
        .update(organizationsTable)
        .set({ name: 'between', ...updateStamps(tenant.user.id) })
        .where(eq(organizationsTable.id, tenant.organization.id));
    });
    await held.promise;

    const renaming = renameOrganization('mine', tag);
    await lockWaiters(1);
    proceed.resolve();
    await writer;

    const { response, error } = await renaming;
    expect(response.status).toBe(412);
    expect(error).toMatchObject({ type: 'precondition_failed' });
    expect(await storedOrganizationName()).toBe('between');
  });

  it('refuses an attachment update whose tag a write since has replaced', async () => {
    const attachment = await seedAttachment({
      tenantId: tenant.tenantId,
      organizationId: tenant.organization.id,
      createdBy: tenant.user.id,
      description: paragraph('before'),
    });
    removals.push(attachment.remove);
    const path = { ...orgPath(), attachmentId: attachment.id };
    const rename = (name: string, ifMatch?: string) =>
      call(updateAttachment, { path, body: { ops: { name }, stx: mockStxFor('name') }, headers: headers(ifMatch) });

    const read = await call(getAttachment, { path, headers: headers() });
    const tag = read.response.headers.get('etag') ?? '';
    expect((await rename('theirs')).response.status).toBe(200);

    const { response, error } = await rename('mine', tag);
    expect(response.status).toBe(412);
    expect(error).toMatchObject({ type: 'precondition_failed' });
    const [row] = await adminDb.select({ name: attachmentsTable.name }).from(attachmentsTable).where(eq(attachmentsTable.id, attachment.id));
    expect(row.name).toBe('theirs');
  });
});
