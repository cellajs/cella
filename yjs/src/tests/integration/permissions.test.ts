import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { hierarchy } from 'shared';
import { testDatabaseUrl } from 'shared/test-db';
import { buildTestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPgConnection, type Tx } from '#/db/create-connection';
import type { DocScope } from '../../constants';
import { authorizeDoc } from '../../data/permissions';
import { cleanupSeed, seedAttachment, seedEntityHierarchy, seedMembership, seedOrg, seedUser } from './seed';

const tenantA = 'yjs-authz-tenant-a';
const tenantB = 'yjs-authz-tenant-b';

const orgA = '20000000-0000-4000-a000-000000000001';
const orgC = '20000000-0000-4000-a000-000000000003';

const userA = randomUUID();
const userB = randomUUID();
const memberA = randomUUID(); // a plain member of orgA

const attachmentA = randomUUID(); // tenantA / orgA, owned by userA
const attachmentM = randomUUID(); // tenantA / orgA, owned by memberA
const attachmentC = randomUUID(); // tenantB / orgC

const hierarchyA = buildTestEntityHierarchyPlan({
  entityType: 'attachment',
  organizationId: orgA,
  makeChannelId: () => randomUUID(),
});
const hierarchyC = buildTestEntityHierarchyPlan({
  entityType: 'attachment',
  organizationId: orgC,
  makeChannelId: () => randomUUID(),
});

/** The document a token asks for: attachmentA in its own scope unless overridden. */
function requested(overrides: Partial<DocScope>): DocScope {
  return { entityType: 'attachment', entityId: attachmentA, tenantId: tenantA, organizationId: orgA, ...overrides };
}

// Exercises the real `loadMemberships` / `resolveEntityScope` SQL and the shared permission engine
// against Postgres, covering cross-tenant isolation. Cross-organization isolation within one tenant
// is not representable: 1 tenant = 1 organization (organizations_tenant_id_key).
describe('Local entity authorization (authorizeDoc)', () => {
  let admin: pg.Client;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: testDatabaseUrl });
    await admin.connect();

    await seedUser(admin, userA, 'a');
    await seedUser(admin, userB, 'b');
    await seedUser(admin, memberA, 'm');

    await seedOrg(admin, tenantA, orgA, 'authz-a');
    await seedOrg(admin, tenantB, orgC, 'authz-c');

    await seedEntityHierarchy(admin, hierarchyA, tenantA, userA, 'authz-a');
    await seedEntityHierarchy(admin, hierarchyC, tenantB, userB, 'authz-c');

    await seedMembership(admin, tenantA, orgA, userA);
    await seedMembership(admin, tenantB, orgC, userB);
    await seedMembership(admin, tenantA, orgA, memberA, hierarchy.getLeastPrivilegedRole('organization'));

    await seedAttachment(admin, attachmentA, tenantA, hierarchyA, userA);
    await seedAttachment(admin, attachmentM, tenantA, hierarchyA, memberA);
    await seedAttachment(admin, attachmentC, tenantB, hierarchyC, userB);
  });

  afterAll(async () => {
    await cleanupSeed(admin, {
      tenantIds: [tenantA, tenantB],
      userIds: [userA, userB, memberA],
      plans: [hierarchyA, hierarchyC],
    });
    await admin.end();
  });

  it("returns the entity row's scope to an org admin editing in their organization (positive control)", async () => {
    await expect(authorizeDoc(userA, requested({ entityId: attachmentA }))).resolves.toEqual({
      entityType: 'attachment',
      entityId: attachmentA,
      tenantId: tenantA,
      organizationId: orgA,
    });
  });

  it('must not authorize a document via a tenant the user holds no membership in', async () => {
    await expect(
      authorizeDoc(userA, requested({ entityId: attachmentC, tenantId: tenantB, organizationId: orgC })),
    ).resolves.toBeNull();
  });

  it('must not authorize a row of another tenant than the token names, on a connection RLS does not bind (defense in depth)', async () => {
    // The relay connects as the runtime role, whose reads RLS limits to the token's tenant, so under it the row is never
    // found. On a superuser or BYPASSRLS connection string, or an app entity table without a tenant policy, the row's
    // own tenant check is what refuses: the same authorization, over a superuser pool.
    const unbound = createPgConnection(testDatabaseUrl, { max: 1 });
    vi.doMock('../../data/db', () => ({
      withRlsTx: <T>(tenantId: string, userId: string, fn: (tx: Tx) => Promise<T>) =>
        unbound.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('app.tenant_id', ${tenantId}, true), set_config('app.user_id', ${userId}, true)`,
          );
          return fn(tx);
        }),
    }));
    vi.resetModules();
    try {
      const { authorizeDoc: authorizeUnbound } = await import('../../data/permissions');
      await expect(authorizeUnbound(userA, requested({ tenantId: tenantB, organizationId: orgA }))).resolves.toBeNull();
      // Positive control on the same pool: the token naming the row's own tenant is authorized.
      await expect(authorizeUnbound(userA, requested({}))).resolves.toMatchObject({
        tenantId: tenantA,
        organizationId: orgA,
      });
    } finally {
      vi.doUnmock('../../data/db');
      vi.resetModules();
      await (unbound.$client as pg.Pool).end();
    }
  });

  it("must not authorize a request that names another tenant's organization", async () => {
    await expect(authorizeDoc(userA, requested({ entityId: attachmentA, organizationId: orgC }))).resolves.toBeNull();
  });

  it("must not let a member write another member's attachment through the relay", async () => {
    await expect(authorizeDoc(memberA, requested({ entityId: attachmentA }))).resolves.toBeNull();
    // Positive control: the member's own attachment.
    await expect(authorizeDoc(memberA, requested({ entityId: attachmentM }))).resolves.toEqual({
      entityType: 'attachment',
      entityId: attachmentM,
      tenantId: tenantA,
      organizationId: orgA,
    });
  });

  it('must not authorize a document for an entity that does not exist', async () => {
    await expect(authorizeDoc(userA, requested({ entityId: randomUUID() }))).resolves.toBeNull();
  });
});
