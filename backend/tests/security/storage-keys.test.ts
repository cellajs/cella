import { eq } from 'drizzle-orm';
import { createAttachments, type GetPresignedUrlsResponse, getPresignedUrls, getUploadToken } from 'sdk';
import { appConfig, hierarchy } from 'shared';
import { buildTestEntityHierarchyPlan, type TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db, getAdminDb } from '#/db/db';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { defaultHeaders } from '../fixtures';
import type { ErrorResponse } from '../helpers';
import { seedEntityHierarchy } from '../hierarchy-helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

/** The storage key an upload for `tenant`'s user lands on: the upload token's `<organizationId>/<userId>` prefix. */
const keyOf = (tenant: TestTenant, name: string) => `${tenant.organization.id}/${tenant.user.id}/${name}`;

/**
 * An attachment row names the object the backend signs for it. The key and bucket come from the client, so the server
 * must hold them to the organization's own upload prefix and the app's buckets: otherwise a user in one tenant plants
 * another tenant's key on their own row and presigns it.
 */
describe('Attachment storage keys', async () => {
  const call = await createAppClient();
  let victim: TestTenant;
  let attacker: TestTenant;
  let attackerPlan: TestEntityHierarchyPlan;

  /**
   * A create body in the attacker's organization, placed at the attachment's home channel (none in cella). `claims`
   * are storage fields the client may send although the server decides them.
   */
  const bodyFor = (
    id: string,
    keys: { original: string; preview?: string },
    claims: { bucketName?: string; publicBucket?: boolean } = {},
  ) => {
    const deepest = hierarchy
      .getOrderedAncestors('attachment')
      .find((type) => type !== 'organization' && attackerPlan.channelIdColumns[appConfig.entityIdColumnKeys[type]]);
    const placement = deepest
      ? {
          [appConfig.entityIdColumnKeys[deepest]]: attackerPlan.channelIdColumns[appConfig.entityIdColumnKeys[deepest]],
        }
      : {};
    return {
      id,
      filename: 'file.pdf',
      contentType: 'application/pdf',
      size: '1024',
      keys,
      ...claims,
      ...placement,
      stx: { mutationId: id, sourceId: 'storage-keys', fieldTimestamps: {} },
    };
  };

  const create = (body: ReturnType<typeof bodyFor>) =>
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

  // Attachments sit under RLS: arrange and assert on the admin connection so a runtime_role run sees every row.
  const adminDb = getAdminDb('storage-keys test');
  const rowExists = async (id: string) =>
    (await adminDb.select({ id: attachmentsTable.id }).from(attachmentsTable).where(eq(attachmentsTable.id, id)))
      .length > 0;

  const storageOf = async (id: string) =>
    (
      await adminDb
        .select({ publicBucket: attachmentsTable.publicBucket, bucketName: attachmentsTable.bucketName })
        .from(attachmentsTable)
        .where(eq(attachmentsTable.id, id))
    )[0];

  const privateStorage = { publicBucket: false, bucketName: appConfig.s3.privateBucket };

  beforeAll(async () => {
    mockFetchRequest();
    victim = await createTestTenant(call, 'storage-victim');
    attacker = await createTestTenant(call, 'storage-attacker');
    attackerPlan = buildTestEntityHierarchyPlan({
      entityType: 'attachment',
      organizationId: attacker.organization.id,
      makeChannelId: () => generateId(),
    });
    await seedEntityHierarchy(db, attackerPlan, {
      tenantId: attacker.tenantId,
      createdBy: attacker.user.id,
      slugPrefix: 'storage-keys',
    });
  });

  afterAll(async () => await clearSecurityTestData());

  it("must not plant another tenant's storage key via createAttachments", async () => {
    const id = generateId();
    const { error, response } = await create(bodyFor(id, { original: keyOf(victim, 'contract.pdf') }));
    expect(response.status).toBe(400);
    expect((error as ErrorResponse).type).toBe('invalid_request');
    expect(await rowExists(id)).toBe(false);
  });

  it('must not reach outside the prefix via dot segments or a variant key', async () => {
    const traversal = generateId();
    const dots = await create(
      bodyFor(traversal, { original: `${attacker.organization.id}/../${keyOf(victim, 'x.pdf')}` }),
    );
    expect(dots.response.status).toBe(400);

    const variant = generateId();
    const body = bodyFor(variant, { original: keyOf(attacker, 'own.pdf') });
    const planted = await create({ ...body, keys: { ...body.keys, preview: keyOf(victim, 'preview.png') } });
    expect(planted.response.status).toBe(400);
    expect(await rowExists(traversal)).toBe(false);
    expect(await rowExists(variant)).toBe(false);
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
    expect(foreign.response.status).toBe(403);

    const own = await call(getUploadToken, {
      query: { templateId: 'attachment', organizationId: attacker.organization.id },
      headers: { ...defaultHeaders, Cookie: attacker.sessionCookie },
    });
    expect(own.response.status).toBe(200);
    expect((own.data as { sub: string }).sub).toBe(`${attacker.organization.id}/${attacker.user.id}`);
  });
});
