import { eq } from 'drizzle-orm';
import { createAttachments, type GetPresignedUrlsResponse, getPresignedUrls, getUploadToken, linkAttachmentKeys } from 'sdk';
import { appConfig } from 'shared';
import type { TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { adminRole, defaultHeaders } from '../fixtures';
import { adminDb, expectRefusal } from '../helpers';
import { attachmentBody, seedAttachmentHome } from '../hierarchy-helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser, createTestTenant, type TestTenant } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

/** The storage key an upload for `tenant`'s user lands on: the upload token's `<organizationId>/<userId>` prefix. */
const keyOf = (tenant: TestTenant, name: string) => `${tenant.organization.id}/${tenant.user.id}/${name}`;

/**
 * An attachment row names the object the backend signs for it. The key and bucket come from the client, so the server
 * must hold them to the uploader's own prefix and the app's buckets: otherwise a user plants another tenant's or another
 * member's key on their own row and presigns it.
 */
describe('Attachment storage keys', async () => {
  const call = await createAppClient();
  let victim: TestTenant;
  let attacker: TestTenant;
  let attackerPlan: TestEntityHierarchyPlan;

  /** A create body in the attacker's organization; `claims` are storage fields the client may send, the server decides. */
  const bodyFor = (id: string, keys: { original: string; preview?: string }, claims: { bucketName?: string; publicBucket?: boolean } = {}) =>
    attachmentBody(id, attackerPlan, { keys, ...claims });

  const create = (body: Record<string, unknown>) =>
    call(createAttachments, {
      path: { tenantId: attacker.tenantId, organizationId: attacker.organization.id },
      body: [body] as never,
      headers: { ...defaultHeaders, Cookie: attacker.sessionCookie },
    });

  const presign = (attachmentId: string) =>
    call(getPresignedUrls, {
      path: { tenantId: attacker.tenantId, organizationId: attacker.organization.id },
      body: { items: [{ attachmentId, variant: 'original' }] },
      headers: { ...defaultHeaders, Cookie: attacker.sessionCookie },
    });

  const rowExists = async (id: string) =>
    (await adminDb.select({ id: attachmentsTable.id }).from(attachmentsTable).where(eq(attachmentsTable.id, id))).length > 0;

  const storageOf = async (id: string) =>
    (
      await adminDb
        .select({ publicBucket: attachmentsTable.publicBucket, bucketName: attachmentsTable.bucketName })
        .from(attachmentsTable)
        .where(eq(attachmentsTable.id, id))
    )[0];

  const privateStorage = { publicBucket: false, bucketName: appConfig.s3.privateBucket };

  beforeAll(async () => {
    victim = await createTestTenant(call, 'storage-victim');
    attacker = await createTestTenant(call, 'storage-attacker');
    attackerPlan = await seedAttachmentHome({ id: attacker.organization.id, tenantId: attacker.tenantId }, attacker.user.id);
  });

  afterAll(async () => await clearSecurityTestData());

  it("must not plant another tenant's storage key via createAttachments", async () => {
    const id = generateId();
    const { error, response } = await create(bodyFor(id, { original: keyOf(victim, 'contract.pdf') }));
    await expectRefusal({ response, error }, 400, 'invalid_request');
    expect(await rowExists(id)).toBe(false);
  });

  it("must not register another member's upload via createAttachments", async () => {
    const coMember = await createOrgUser(call, attacker.tenantId, attacker.organization.id, 'storage-key-owner');
    const id = generateId();
    const { error, response } = await create(bodyFor(id, { original: `${attacker.organization.id}/${coMember.id}/payroll.pdf` }));
    await expectRefusal({ response, error }, 400, 'invalid_request');
    expect(await rowExists(id)).toBe(false);
  });

  it('must not reach outside the prefix via dot segments or a variant key', async () => {
    const traversal = generateId();
    const dots = await create(bodyFor(traversal, { original: `${attacker.organization.id}/../${keyOf(victim, 'x.pdf')}` }));
    expect(dots.response.status).toBe(400);

    const variant = generateId();
    const body = bodyFor(variant, { original: keyOf(attacker, 'own.pdf') });
    const planted = await create({ ...body, keys: { ...body.keys, preview: keyOf(victim, 'preview.png') } });
    expect(planted.response.status).toBe(400);
    expect(await rowExists(traversal)).toBe(false);
    expect(await rowExists(variant)).toBe(false);
  });

  it('must not reach outside the prefix behind a blob: prefix via createAttachments', async () => {
    const vectors = [
      `blob:x/../${keyOf(victim, 'contract.pdf')}`,
      `blob:${attacker.organization.id}/../${keyOf(victim, 'contract.pdf')}`,
      `blob:http://localhost:3000/../../${keyOf(victim, 'contract.pdf')}`,
    ];
    for (const original of vectors) {
      const id = generateId();
      const { error, response } = await create(bodyFor(id, { original }));
      await expectRefusal({ response, error }, 400, 'invalid_request', original);
      expect(await rowExists(id), original).toBe(false);
    }
  });

  it('must not sign a blob: key via getPresignedUrls', async () => {
    for (const planted of [`blob:/../${keyOf(victim, 'contract.pdf')}`, 'blob:http://localhost:3000/0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2c']) {
      const id = generateId();
      expect((await create(bodyFor(id, { original: keyOf(attacker, 'own.pdf') }))).response.status).toBe(201);
      await adminDb
        .update(attachmentsTable)
        .set({ keys: { original: planted } })
        .where(eq(attachmentsTable.id, id));

      const { data, response } = await presign(id);
      expect(response.status).toBe(200);
      const result = data as GetPresignedUrlsResponse;
      expect(result.data, planted).toEqual([]);
      expect(result.rejectedIds, planted).toEqual([id]);
    }
  });

  it('stores an offline upload under its local blob URL (positive control)', async () => {
    const id = generateId();
    const original = 'blob:http://localhost:3000/0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2c';
    expect((await create(bodyFor(id, { original }))).response.status).toBe(201);
    expect(await rowExists(id)).toBe(true);
  });

  it('must not name a bucket outside the app via createAttachments', async () => {
    const id = generateId();
    const claims = { bucketName: 'another-apps-bucket' };
    const { response } = await create(bodyFor(id, { original: keyOf(attacker, 'own.pdf') }, claims));
    // The server decides the bucket: the claim is ignored and the row names the app's private bucket.
    expect(response.status).toBe(201);
    expect(await storageOf(id)).toEqual(privateStorage);
  });

  it('must not store an attachment as public via claiming the public bucket', async () => {
    const id = generateId();
    const claims = { publicBucket: true, bucketName: appConfig.s3.publicBucket };
    const { response } = await create(bodyFor(id, { original: keyOf(attacker, 'own.pdf') }, claims));
    expect(response.status).toBe(201);
    expect(await storageOf(id)).toEqual(privateStorage);
  });

  it('must not sign a planted key already stored on a row via getPresignedUrls', async () => {
    const id = generateId();
    expect((await create(bodyFor(id, { original: keyOf(attacker, 'own.pdf') }))).response.status).toBe(201);
    // A row written before keys were checked: the presign boundary refuses it on its own.
    const planted = await adminDb
      .update(attachmentsTable)
      .set({ keys: { original: keyOf(victim, 'contract.pdf') } })
      .where(eq(attachmentsTable.id, id))
      .returning({ id: attachmentsTable.id });
    expect(planted).toHaveLength(1);

    const { data, response } = await presign(id);
    expect(response.status).toBe(200);
    const result = data as GetPresignedUrlsResponse;
    expect(result.data).toEqual([]);
    expect(result.rejectedIds).toEqual([id]);
  });

  it('stores an attachment private and signs its key under the organization prefix (positive control)', async () => {
    const id = generateId();
    const key = keyOf(attacker, 'own.pdf');
    expect((await create(bodyFor(id, { original: key }))).response.status).toBe(201);
    expect(await storageOf(id)).toEqual(privateStorage);

    const { data, response } = await presign(id);
    expect(response.status).toBe(200);
    const result = data as GetPresignedUrlsResponse;
    expect(result.rejectedIds).toEqual([]);
    expect(result.data[0]?.url).toContain(key);
  });

  it('must not issue an upload token into another organization via organizationId', async () => {
    const foreign = await call(getUploadToken, {
      query: { templateId: 'attachment', organizationId: victim.organization.id },
      headers: { ...defaultHeaders, Cookie: attacker.sessionCookie },
    });
    expect(foreign.response.status).toBe(404);

    const own = await call(getUploadToken, {
      query: { templateId: 'attachment', organizationId: attacker.organization.id },
      headers: { ...defaultHeaders, Cookie: attacker.sessionCookie },
    });
    expect(own.response.status).toBe(200);
    expect((own.data as { sub: string }).sub).toBe(`${attacker.organization.id}/${attacker.user.id}`);
  });

  describe('linking the keys of a deferred upload', () => {
    const localKey = 'blob:http://localhost:3000/0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2c';

    const link = (id: string, keys: { original: string; preview?: string }, cookie = attacker.sessionCookie) =>
      call(linkAttachmentKeys, {
        path: { tenantId: attacker.tenantId, organizationId: attacker.organization.id, id },
        body: { keys },
        headers: { ...defaultHeaders, Cookie: cookie },
      });

    const keysOf = async (id: string) =>
      (await adminDb.select({ keys: attachmentsTable.keys }).from(attachmentsTable).where(eq(attachmentsTable.id, id)))[0]?.keys;

    const createLocal = async () => {
      const id = generateId();
      expect((await create(bodyFor(id, { original: localKey }))).response.status).toBe(201);
      return id;
    };

    it("links the uploader's keys once; the same keys again are a no-op (positive control)", async () => {
      const id = await createLocal();
      const keys = { original: keyOf(attacker, 'late.png'), preview: keyOf(attacker, 'late-preview.png') };

      expect((await link(id, keys)).response.status).toBe(200);
      expect(await keysOf(id)).toEqual(keys);
      expect((await link(id, keys)).response.status).toBe(200);

      const { response, error } = await link(id, { original: keyOf(attacker, 'other.png') });
      await expectRefusal({ response, error }, 409, 'invalid_request');
      expect(await keysOf(id)).toEqual(keys);
    });

    it('must not let anyone but the uploader link keys, an organization admin included', async () => {
      const id = await createLocal();
      const coAdmin = await createOrgUser(call, attacker.tenantId, attacker.organization.id, 'storage-co-admin', adminRole);
      const keys = { original: `${attacker.organization.id}/${coAdmin.id}/theirs.png` };

      const { response, error } = await link(id, keys, coAdmin.sessionCookie);
      await expectRefusal({ response, error }, 403, 'forbidden');
      expect(await keysOf(id)).toEqual({ original: localKey });
    });

    it("must not link a key outside the uploader's own prefix, or a local key", async () => {
      const id = await createLocal();
      const coMember = await createOrgUser(call, attacker.tenantId, attacker.organization.id, 'storage-co-member');
      const refused = [
        keyOf(victim, 'contract.pdf'),
        `${attacker.organization.id}/${coMember.id}/theirs.png`,
        `${attacker.organization.id}/${attacker.user.id}/../${coMember.id}/theirs.png`,
        localKey,
        '',
      ];
      for (const original of refused) {
        const { response, error } = await link(id, { original });
        await expectRefusal({ response, error }, 400, 'invalid_request', original);
      }
      expect(await keysOf(id)).toEqual({ original: localKey });
    });

    it('must not link keys to a deleted attachment', async () => {
      const id = await createLocal();
      await adminDb.update(attachmentsTable).set({ deletedAt: new Date().toISOString() }).where(eq(attachmentsTable.id, id));

      const { response, error } = await link(id, { original: keyOf(attacker, 'late.png') });
      await expectRefusal({ response, error }, 404, 'not_found');
    });
  });
});
