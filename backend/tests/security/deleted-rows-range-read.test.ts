import { appConfig, hierarchy } from 'shared';
import { buildTestEntityHierarchyPlan, toStrictHomePlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, describe, expect, it } from 'vitest';
import { getAdminDb } from '#/db/db';
import { hasPublishedAt } from '#/db/utils/published-predicate';
import { buildInsertableProduct } from '#/mocks';
import { getEntityTable } from '#/tables';
import { adminRole, defaultHeaders } from '../fixtures';
import { joinAttachmentHome, seedEntityHierarchy } from '../hierarchy-helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser, createTestTenant } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

type SchemaNode = { $ref?: string; anyOf?: SchemaNode[]; items?: SchemaNode; properties?: Record<string, SchemaNode>; enum?: unknown[] };
type Row = Record<string, unknown>;

/** What a tombstone may carry: the fields that place a deleted row and let a client drop it, never its content. */
const placingKeys = (entityType: string) =>
  new Set([
    'id',
    'seq',
    'createdAt',
    'publishedAt',
    'deletedAt',
    ...hierarchy.getOrderedAncestors(entityType).map((type) => appConfig.entityIdColumnKeys[type]),
  ]);

/**
 * A range read returns soft-deleted rows so client caches drop them, for the whole deleted-items period. A reader who
 * joined after the delete never saw the row live and its single-row read answers 404, so the range read must hand it a
 * tombstone and never the content. The table is every product list with a range read in the app's OpenAPI document.
 */
describe('Deleted rows in range reads', async () => {
  const call = await createAppClient();
  const { baseApp } = await import('#/routes');
  const { paths = {}, components } = baseApp.getOpenAPI31Document({ openapi: '3.1.0', info: { title: 'range reads', version: '0' } });
  const schemas: Record<string, SchemaNode> = components?.schemas ?? {};

  const rangeReads = Object.entries(paths).flatMap(([path, item]) => {
    const operation = item.get;
    if (!operation?.parameters?.some((parameter) => 'name' in parameter && parameter.name === 'afterSeq')) return [];
    const response = operation.responses?.['200'];
    const page: SchemaNode | undefined = response && 'content' in response ? response.content?.['application/json']?.schema : undefined;
    const itemSchema = page?.properties?.items?.items;
    const variants = itemSchema?.anyOf ?? (itemSchema ? [itemSchema] : []);
    const fullName =
      variants
        .find((variant) => variant.$ref)
        ?.$ref?.split('/')
        .pop() ?? '';
    const tombstone = variants.find((variant) => !variant.$ref);
    return [
      {
        operationId: String(operation.operationId),
        entityType: appConfig.productEntityTypes.find((type) => type === schemas[fullName]?.properties?.entityType?.enum?.[0]),
        path,
        hasDetail: !!paths[`${path}/{id}`]?.get,
        declaredKeys: Object.keys(tombstone?.properties ?? {}),
      },
    ];
  });

  afterAll(async () => await clearSecurityTestData());

  it.each(rangeReads)("must not return a deleted $entityType's content to a reader who joined after the delete", async (read) => {
    const { entityType } = read;
    if (!entityType) throw new Error(`${read.operationId}: its items name no product entity type`);
    const adminDb = getAdminDb('test setup');
    const label = `deleted-${entityType}-range`;

    // The writer, an organization admin, creates two rows and deletes one before the reader joins.
    const writer = await createTestTenant(call, label);
    const organization = { id: writer.organization.id, tenantId: writer.tenantId };
    const plan = toStrictHomePlan(buildTestEntityHierarchyPlan({ entityType, organizationId: organization.id, makeChannelId: () => generateId() }));
    await seedEntityHierarchy(adminDb, plan, { tenantId: organization.tenantId, createdBy: writer.user.id, slugPrefix: label });

    const table = getEntityTable(entityType);
    const now = new Date().toISOString();
    const [liveId, deletedId] = [generateId(), generateId()];
    // `seq` stands in for the CDC worker's stamp, which a test without the worker never gets.
    const row = (id: string, seq: number, deletedAt: string | null) =>
      buildInsertableProduct(
        entityType,
        {
          id,
          tenantId: organization.tenantId,
          ...plan.channelIdColumns,
          createdBy: writer.user.id,
          updatedBy: null,
          deletedBy: deletedAt ? writer.user.id : null,
          deletedAt,
          seq,
          ...(hasPublishedAt(table) && { publishedAt: now }),
        },
        `${label}-${seq}`,
      );
    // buildInsertableProduct returns a config-derived Record, so the insert type needs a cast.
    await adminDb.insert(table).values([row(liveId, 1, null), row(deletedId, 2, now)] as (typeof table.$inferInsert)[]);

    // The most privileged role, so the read scope holds both rows under any app policy.
    const reader = await createOrgUser(call, organization.tenantId, organization.id, `${label}-late`, adminRole);
    await joinAttachmentHome(organization, plan, reader.id);

    const listPath = read.path.replace('{tenantId}', organization.tenantId).replace('{organizationId}', organization.id);
    const request = (url: string, cookie: string) => baseApp.request(url, { headers: { ...defaultHeaders, Cookie: cookie } });

    // The writer, who saw the row live, gets the same tombstone: the projection is per row, not per viewer.
    for (const cookie of [reader.sessionCookie, writer.sessionCookie]) {
      const response = await request(`${listPath}?afterSeq=0&untilSeq=2&limit=100`, cookie);
      expect(response.status).toBe(200);
      const { items } = (await response.json()) as { items: Row[] };
      const live = items.find((item) => item.id === liveId) ?? {};
      const tombstone = items.find((item) => item.id === deletedId) ?? {};

      // The live row of the same range comes whole, so the read itself is not what hides the content.
      expect(live).toHaveProperty('name');
      const placing = placingKeys(entityType);
      const expected = Object.keys(live)
        .filter((key) => placing.has(key))
        .sort();
      expect(Object.keys(tombstone).sort()).toEqual(expected);
      expect([...read.declaredKeys].sort(), `${read.operationId} declares the tombstone item (productListResponseSchema)`).toEqual(expected);
      for (const content of ['name', 'filename', 'keys', 'description']) expect(tombstone).not.toHaveProperty(content);
      expect(tombstone).toMatchObject({ id: deletedId, seq: 2, deletedAt: expect.any(String) });
    }

    if (read.hasDetail) expect((await request(`${listPath}/${deletedId}`, reader.sessionCookie)).status).toBe(404);
  });
});
