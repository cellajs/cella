import { inArray } from 'drizzle-orm';
import { updateMe, updateOrganization } from 'sdk';
import { appConfig } from 'shared';
import type { TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteStoredObjects } from '#/lib/object-storage';
import { buildInsertableProduct } from '#/mocks';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { defaultHeaders } from './fixtures';
import { adminDb as db } from './helpers';
import { cleanupEntityHierarchy, insertAttachmentRow, seedAttachmentHome } from './hierarchy-helpers';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './security/helpers';
import { createAppClient } from './test-client';
import { setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

const urlOf = (key: string) => `${appConfig.s3.publicCDNUrl}/${key}`;
const deletedKeys = () => vi.mocked(deleteStoredObjects).mock.calls.flatMap(([, keys]) => keys);

/** A replaced avatar or cover stays readable by its public URL until its object is deleted; nothing else deletes it. */
describe('Replaced images', async () => {
  const call = await createAppClient();
  let tenant: TestTenant;
  let plan: TestEntityHierarchyPlan;
  let headers: Record<string, string>;
  const attachmentId = generateId();
  const orgKey = (name: string) => `${tenant.organization.id}/${tenant.user.id}/${name}`;

  beforeAll(async () => {
    tenant = await createTestTenant(call, 'replaced-images');
    headers = { ...defaultHeaders, Cookie: tenant.sessionCookie };
    plan = await seedAttachmentHome({ id: tenant.organization.id, tenantId: tenant.tenantId }, tenant.user.id);
    await insertAttachmentRow(
      buildInsertableProduct(
        'attachment',
        {
          id: attachmentId,
          tenantId: tenant.tenantId,
          ...plan.channelIdColumns,
          bucketName: appConfig.s3.publicBucket,
          keys: { original: orgKey('shared.webp') },
          createdBy: tenant.user.id,
          updatedBy: null,
        },
        attachmentId,
      ),
    );
  });

  beforeEach(() => vi.mocked(deleteStoredObjects).mockClear());

  afterAll(async () => {
    await db.delete(attachmentsTable).where(inArray(attachmentsTable.id, [attachmentId]));
    await cleanupEntityHierarchy(db, plan);
    await clearSecurityTestData();
  });

  it("deletes an organization's replaced and cleared images, never a key an attachment still names", async () => {
    const path = { tenantId: tenant.tenantId, id: tenant.organization.id };
    const body = { thumbnailUrl: urlOf(orgKey('old.webp')), bannerUrl: urlOf(orgKey('shared.webp')) };
    expect((await call(updateOrganization, { path, body, headers })).response.status).toBe(200);
    vi.mocked(deleteStoredObjects).mockClear();

    const replace = { thumbnailUrl: urlOf(orgKey('new.webp')), bannerUrl: null };
    expect((await call(updateOrganization, { path, body: replace, headers })).response.status).toBe(200);

    expect(deletedKeys()).toEqual([orgKey('old.webp')]);
  });

  it("deletes a user's replaced avatar under their own prefix, never another's", async () => {
    const own = `${tenant.user.id}/old-avatar.webp`;
    const foreign = `${generateId()}/avatar.webp`;
    expect((await call(updateMe, { body: { thumbnailUrl: urlOf(own), bannerUrl: urlOf(foreign) }, headers })).response.status).toBe(200);
    vi.mocked(deleteStoredObjects).mockClear();

    const replace = { thumbnailUrl: urlOf(`${tenant.user.id}/new-avatar.webp`), bannerUrl: null };
    expect((await call(updateMe, { body: replace, headers })).response.status).toBe(200);

    expect(deletedKeys()).toEqual([own]);
  });
});
