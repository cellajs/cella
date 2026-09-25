import { eq } from 'drizzle-orm';
import { updateAttachment, updateOrganization } from 'sdk';
import { appConfig } from 'shared';
import { buildTestEntityHierarchyPlan, type TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateServerHLC } from '#/core/stx';
import { getAdminDb } from '#/db/db';
import { buildInsertableProduct } from '#/mocks';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { materializeDescriptionOp } from '#/modules/yjs/operations/materialize-description';
import { mockStxBase } from '#/schemas/sync-transaction-mocks';
import { defaultHeaders } from '../fixtures';
import type { ErrorResponse } from '../helpers';
import { cleanupEntityHierarchy, seedEntityHierarchy } from '../hierarchy-helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

const imageBlock = (url: string) => ({
  id: generateId(),
  type: 'image',
  props: { url, name: 'image.png', caption: '' },
  content: [],
  children: [],
});

const documentOf = (...urls: string[]) => JSON.stringify(urls.map(imageBlock));

const urlsIn = (description: string | null) =>
  (JSON.parse(description ?? '[]') as { props: { url: string } }[]).map((block) => block.props.url);

/**
 * A media block renders its `url` in every viewer's browser. It may name only an attachment id or a storage key under
 * the document's own organization (plus a re-hosted asset, not configured here): a client write naming anything else is
 * refused, and the Yjs relay, whose writes must persist, blanks it.
 */
describe('Block media references', async () => {
  const call = await createAppClient();
  // Attachments sit under RLS: arrange and assert on the admin connection so a runtime_role run sees the row.
  const adminDb = getAdminDb('block-media-refs test');
  const attachmentId = generateId();
  const original = documentOf();
  let owner: TestTenant;
  let victim: TestTenant;
  let plan: TestEntityHierarchyPlan;

  const cdn = appConfig.s3.publicCDNUrl;
  const ownKey = () => `${owner.organization.id}/${owner.user.id}/photo.webp`;
  const victimKey = () => `${victim.organization.id}/${victim.user.id}/contract.png`;

  /** Each vector names another origin, another organization's object, or a path that climbs out of the own prefix. */
  const bypasses = (): [string, string][] => [
    ['a CDN-prefixed userinfo URL', `${cdn}@evil.example/pixel.png`],
    ['a CDN-prefixed hostname', `${cdn}.evil.example/pixel.png`],
    ['a protocol-relative URL', '//evil.example/pixel.png'],
    ['a backslash URL', '\\\\evil.example\\pixel.png'],
    ["another organization's key", victimKey()],
    ['a dot segment', `${owner.organization.id}/../${victimKey()}`],
    ['an encoded dot segment', `${owner.organization.id}/%2e%2e/${victimKey()}`],
    ['an encoded slash', `${owner.organization.id}/..%2f..%2f${victimKey()}`],
    ['an image host on the former allowlist', 'https://i.imgur.com/abc123.png'],
    ["an absolute URL on the app's own CDN", `${cdn}/${ownKey()}`],
  ];

  const putDescription = (description: string) =>
    call(updateAttachment, {
      path: { tenantId: owner.tenantId, organizationId: owner.organization.id, id: attachmentId },
      body: {
        ops: { description },
        stx: { ...mockStxBase(`stx:${generateId()}`), fieldTimestamps: { description: generateServerHLC('test') } },
      },
      headers: { ...defaultHeaders, Cookie: owner.sessionCookie },
    });

  const storedDescription = async () => {
    const [row] = await adminDb
      .select({ description: attachmentsTable.description })
      .from(attachmentsTable)
      .where(eq(attachmentsTable.id, attachmentId));
    return row?.description ?? null;
  };

  const resetDescription = () =>
    adminDb.update(attachmentsTable).set({ description: original }).where(eq(attachmentsTable.id, attachmentId));

  const storedWelcomeText = async () => {
    const [row] = await adminDb
      .select({ welcomeText: organizationsTable.welcomeText })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, owner.organization.id));
    return row?.welcomeText ?? null;
  };

  const putWelcomeText = (welcomeText: string) =>
    call(updateOrganization, {
      path: { tenantId: owner.tenantId, id: owner.organization.id },
      body: { welcomeText },
      headers: { ...defaultHeaders, Cookie: owner.sessionCookie },
    });

  beforeAll(async () => {
    mockFetchRequest();
    owner = await createTestTenant(call, 'media-owner');
    victim = await createTestTenant(call, 'media-victim');
    plan = buildTestEntityHierarchyPlan({
      entityType: 'attachment',
      organizationId: owner.organization.id,
      makeChannelId: () => generateId(),
    });
    await seedEntityHierarchy(adminDb, plan, {
      tenantId: owner.tenantId,
      createdBy: owner.user.id,
      slugPrefix: 'block-media-refs',
    });
    const row = buildInsertableProduct(
      'attachment',
      {
        id: attachmentId,
        tenantId: owner.tenantId,
        ...plan.channelIdColumns,
        description: original,
        createdBy: owner.user.id,
        updatedBy: null,
        deletedBy: null,
      },
      attachmentId,
    );
    // buildInsertableProduct returns a config-derived Record, so the insert type needs a cast.
    await adminDb.insert(attachmentsTable).values(row as typeof attachmentsTable.$inferInsert);
  });

  afterAll(async () => {
    await adminDb.delete(attachmentsTable).where(eq(attachmentsTable.id, attachmentId));
    await cleanupEntityHierarchy(adminDb, plan);
    await clearSecurityTestData();
  });

  describe('client writes', () => {
    it('must not load media from outside the organization via any of the bypass vectors', async () => {
      for (const [label, url] of bypasses()) {
        const { error, response } = await putDescription(documentOf(url));
        expect(response.status, label).toBe(400);
        expect((error as ErrorResponse).type, label).toBe('invalid_request');
        expect(await storedDescription(), label).toBe(original);
      }
    });

    it('must not load media from outside the organization via an organization welcome text', async () => {
      const before = await storedWelcomeText();
      for (const url of ['//evil.example/pixel.png', victimKey()]) {
        const { error, response } = await putWelcomeText(documentOf(url));
        expect(response.status, url).toBe(400);
        expect((error as ErrorResponse).type, url).toBe('invalid_request');
      }
      expect(await storedWelcomeText()).toBe(before);
    });

    it('stores an attachment id and a key under the own organization (positive control)', async () => {
      const valid = [generateId(), ownKey(), `/${ownKey()}`];
      const { response } = await putDescription(documentOf(...valid));
      expect(response.status).toBe(200);
      expect(urlsIn(await storedDescription())).toEqual(valid);
      await resetDescription();

      const welcomeText = documentOf(ownKey());
      expect((await putWelcomeText(welcomeText)).response.status).toBe(200);
      expect(await storedWelcomeText()).toBe(welcomeText);
    });
  });

  describe('relay writes', () => {
    it('must not persist media from outside the organization via a collaborative document', async () => {
      const valid = [generateId(), ownKey()];
      const refused = bypasses().map(([, url]) => url);

      const result = await materializeDescriptionOp({
        entityType: 'attachment',
        entityId: attachmentId,
        tenantId: owner.tenantId,
        organizationId: owner.organization.id,
        editors: [owner.user.id],
        description: documentOf(...refused, ...valid),
      });

      expect(result).toMatchObject({ outcome: 'written', sanitized: true });
      // Refused references are blanked in place, so the document keeps its shape; valid ones survive unchanged.
      expect(urlsIn(await storedDescription())).toEqual([...refused.map(() => ''), ...valid]);
      await resetDescription();
    });
  });
});
