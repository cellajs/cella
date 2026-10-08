import { eq } from 'drizzle-orm';
import { updateAttachment } from 'sdk';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateServerHLC } from '#/core/stx';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { mockStxBase } from '#/schemas/sync-transaction-mocks';
import { defaultHeaders } from './fixtures';
import { adminDb } from './helpers';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './security/helpers';
import { holdAttachmentRow, lockWaiters, seedAttachment } from './security/yjs-helpers';
import { createAppClient } from './test-client';
import { setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

const description = (text: string) =>
  JSON.stringify([{ id: generateId(), type: 'paragraph', props: {}, content: [{ type: 'text', text, styles: {} }], children: [] }]);

type Edited = { stx: { fieldTimestamps: Record<string, string> } };

/**
 * An update merges its change with the stored row: the field timestamps that later decide which edit of a field wins.
 * Two updates of one row that overlap must each merge with the row as the other left it, or the later write stores
 * timestamps without the earlier one's.
 */
describe('Overlapping edits of one attachment', async () => {
  const call = await createAppClient();
  let tenant: TestTenant;
  const removals: (() => Promise<void>)[] = [];

  beforeAll(async () => {
    tenant = await createTestTenant(call, 'overlapping-edits');
  });

  afterAll(async () => {
    for (const remove of removals) await remove();
    await clearSecurityTestData();
  });

  const edit = (id: string, field: 'name' | 'description', value: string) =>
    call(updateAttachment, {
      path: { organizationId: tenant.organization.id, tenantId: tenant.tenantId, id },
      body: {
        ops: { [field]: value },
        stx: { ...mockStxBase(`stx:${generateId()}`), fieldTimestamps: { [field]: generateServerHLC('test-client') } },
      },
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });

  it('stores the field timestamp of each of two edits that arrive while the row is held', async () => {
    const attachment = await seedAttachment({
      tenantId: tenant.tenantId,
      organizationId: tenant.organization.id,
      createdBy: tenant.user.id,
      description: description('before'),
    });
    removals.push(attachment.remove);

    // While the row is held both edits wait on it. Each reads the row only once the lock is its own, so the second
    // one merges with what the first one stored.
    const holder = await holdAttachmentRow(attachment.id);
    const renaming = edit(attachment.id, 'name', 'renamed');
    const describing = edit(attachment.id, 'description', description('after'));
    await lockWaiters(2);
    holder.release();
    const [renamed, described] = await Promise.all([renaming, describing]);
    await holder.done;

    expect(renamed.response.status).toBe(200);
    expect(described.response.status).toBe(200);

    const [stored] = await adminDb
      .select({ name: attachmentsTable.name, stx: attachmentsTable.stx })
      .from(attachmentsTable)
      .where(eq(attachmentsTable.id, attachment.id));
    expect(stored.name).toBe('renamed');
    expect(stored.stx?.fieldTimestamps.name).toBe((renamed.data as Edited).stx.fieldTimestamps.name);
    expect(stored.stx?.fieldTimestamps.description).toBe((described.data as Edited).stx.fieldTimestamps.description);
  });
});
