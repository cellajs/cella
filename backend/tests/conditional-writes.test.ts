import { eq } from 'drizzle-orm';
import { getAttachment, getOrganization, updateAttachment, updateOrganization } from 'sdk';
import { appConfig, type ChannelEntityType, hierarchy, type ProductEntityType } from 'shared';
import { buildTestEntityHierarchyPlan, type TestEntityHierarchyPlan, toStrictHomePlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { toColumnName, toTableName } from 'shared/utils/schema-naming';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hasPublishedAt } from '#/db/utils/published-predicate';
import { updateStamps } from '#/db/utils/stamps';
import { buildInsertableProduct } from '#/mocks';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { mockStxFor } from '#/schemas/sync-transaction-mocks';
import { getEntityTable } from '#/tables';
import { adminRole, defaultHeaders } from './fixtures';
import { adminDb } from './helpers';
import { joinAttachmentHome, seedEntityHierarchy } from './hierarchy-helpers';
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

  it('sends a gzip client the strong tag, which its If-Match then matches', async () => {
    const { baseApp } = await import('#/routes');
    const read = await baseApp.request(`/tenants/${tenant.tenantId}/organizations/${tenant.organization.id}`, {
      headers: { ...headers(), 'Accept-Encoding': 'gzip' },
    });
    expect(read.status).toBe(200);
    const tag = read.headers.get('etag') ?? '';
    expect(tag).toMatch(/^"/);

    expect((await renameOrganization('zipped', tag)).response.status).toBe(200);
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
    const attachment = await seedAttachment(tenant, { description: paragraph('before') });
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

const httpMethods = ['get', 'post', 'patch', 'delete'] as const;

const entityTypeOfIdParam = new Map<string, string>(Object.entries(appConfig.entityIdColumnKeys).map(([type, key]) => [key, type]));

/**
 * Every route that documents `If-Match` answers a tag the entity never had with 412 and writes nothing, whatever its
 * operation does. The table is the app's own OpenAPI document, so an app's channel and product routes are walked too;
 * a write sends the request body its route documents as the example.
 */
describe('Stale If-Match on every conditional route', async () => {
  const call = await createAppClient();
  const { baseApp } = await import('#/routes');
  const { paths = {} } = baseApp.getOpenAPI31Document({ openapi: '3.1.0', info: { title: 'preconditions', version: '0' } });

  const routes = Object.entries(paths).flatMap(([path, item]) =>
    httpMethods.flatMap((method) => {
      const operation = item[method];
      const parameters = (operation?.parameters ?? []).flatMap((parameter) => ('$ref' in parameter ? [] : [parameter]));
      if (!operation || !parameters.some(({ in: at, name }) => at === 'header' && name === 'If-Match')) return [];
      // The app's own document spells a custom method as its route declares it (`/~verb`), the published one `:verb`.
      const [, entityPath = path, idParam = '', verb] = /^(.*\/\{(\w+)\})(?:\/~([a-z][a-z0-9-]*))?$/.exec(path) ?? [];
      const body = operation.requestBody && !('$ref' in operation.requestBody) ? operation.requestBody : undefined;
      const query = parameters.flatMap(({ in: at, name, required, schema }) => {
        const value = schema && !('$ref' in schema) ? (schema.enum?.[0] ?? schema.default) : undefined;
        return at === 'query' && required && value !== undefined ? [[name, String(value)]] : [];
      });
      return [
        {
          name: `${method.toUpperCase()} ${verb ? `${entityPath}:${verb}` : path} (${operation.operationId})`,
          method: method.toUpperCase(),
          path: verb ? `${entityPath}:${verb}` : path,
          entityPath,
          entityType: entityTypeOfIdParam.get(idParam),
          query: new URLSearchParams(query),
          body: body && JSON.stringify(body.content['application/json']?.example ?? {}),
        },
      ];
    }),
  );

  let tenant: TestTenant;
  const rowIds = new Map<string, string>();

  beforeAll(async () => {
    tenant = await createTestTenant(call, 'stale-if-match');
  });

  afterAll(async () => await clearSecurityTestData());

  const organization = () => ({ id: tenant.organization.id, tenantId: tenant.tenantId });

  /** Seeds the plan's channels and makes the tenant's admin an admin of each, so every action reaches the row. */
  const seedHome = async (plan: TestEntityHierarchyPlan) => {
    await seedEntityHierarchy(adminDb, plan, { tenantId: tenant.tenantId, createdBy: tenant.user.id, slugPrefix: 'stale-if-match' });
    await joinAttachmentHome(organization(), plan, tenant.user.id, adminRole);
  };

  /** A channel below the organization: its plan seeds the channels above it, and the row itself is added to it. */
  const seedChannel = async (channelType: ChannelEntityType) => {
    const plan = buildTestEntityHierarchyPlan({ entityType: channelType, organizationId: tenant.organization.id, makeChannelId: () => generateId() });
    const parentChannelType = hierarchy.getParent(channelType);
    const parentId = parentChannelType && plan.channelIdsByType[parentChannelType];
    if (!parentChannelType || !parentId) throw new Error(`${channelType} has no parent channel to seed it under`);
    const parentIdKey = appConfig.entityIdColumnKeys[parentChannelType];
    const id = generateId();
    const row = {
      channelType,
      id,
      tableName: toTableName(channelType),
      parentChannelType,
      parentId,
      parentIdKey,
      parentColumnName: toColumnName(parentIdKey),
    };
    await seedHome({ ...plan, seedChannelRows: [...plan.seedChannelRows, { ...row, ancestorColumns: plan.sqlChannelColumns }] });
    return id;
  };

  const seedProduct = async (entityType: ProductEntityType) => {
    const plan = toStrictHomePlan(
      buildTestEntityHierarchyPlan({ entityType, organizationId: tenant.organization.id, makeChannelId: () => generateId() }),
    );
    await seedHome(plan);
    const table = getEntityTable(entityType);
    const id = generateId();
    const row = buildInsertableProduct(entityType, {
      id,
      tenantId: tenant.tenantId,
      ...plan.channelIdColumns,
      createdBy: tenant.user.id,
      updatedBy: null,
      deletedBy: null,
      deletedAt: null,
      ...(hasPublishedAt(table) && { publishedAt: new Date().toISOString() }),
    });
    // buildInsertableProduct returns a config-derived Record, so the insert type needs a cast.
    await adminDb.insert(table).values(row as typeof table.$inferInsert);
    return id;
  };

  /** One row per entity type the routes act on, in the tenant's organization. */
  const rowOf = async (entityType: string) => {
    const seeded = rowIds.get(entityType);
    if (seeded) return seeded;
    let id: string;
    if (entityType === 'organization') id = tenant.organization.id;
    else if (hierarchy.isProduct(entityType)) id = await seedProduct(entityType);
    else if (hierarchy.isChannel(entityType)) id = await seedChannel(entityType);
    else throw new Error(`${entityType} is neither a channel nor a product`);
    rowIds.set(entityType, id);
    return id;
  };

  const headers = (ifMatch?: string) => ({ ...defaultHeaders, Cookie: tenant.sessionCookie, ...(ifMatch && { 'If-Match': ifMatch }) });

  it('reads the conditional routes from the document', () => {
    // An empty table would pass vacuously: the organization is in every app.
    expect(routes.map(({ name }) => name)).toEqual(
      expect.arrayContaining([expect.stringContaining('(getOrganization)'), expect.stringContaining('(updateOrganization)')]),
    );
  });

  it.each(routes)('must not answer $name with a stale If-Match other than 412', async (route) => {
    if (!route.entityType) throw new Error(`${route.name}: its path ends in no channel or product id param`);
    const id = await rowOf(route.entityType);
    const fill = (path: string) =>
      path
        .replace('{tenantId}', tenant.tenantId)
        .replace('{organizationId}', tenant.organization.id)
        .replace(/\{\w+\}/g, id);
    const tagOf = async () => (await baseApp.request(fill(route.entityPath), { headers: headers() })).headers.get('etag');
    const before = await tagOf();
    expect(before, `${route.name}: the entity's own GET sends its ETag`).toBeTruthy();

    const search = route.query.size ? `?${route.query}` : '';
    const response = await baseApp.request(`${fill(route.path)}${search}`, { method: route.method, headers: headers('"stale"'), body: route.body });
    expect(response.status, `${route.name}: ${await response.clone().text()}`).toBe(412);
    expect(await tagOf(), `${route.name} wrote past a stale If-Match`).toBe(before);
  });
});
