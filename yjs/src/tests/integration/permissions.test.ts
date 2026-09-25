import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { testDatabaseUrl } from 'shared/test-db';
import { buildTestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DocScope } from '../../constants';
import { authorizeDoc } from '../../data/permissions';
import {
  cleanupEntityHierarchy,
  seedAttachment,
  seedEntityHierarchy,
  seedMembership,
  seedOrg,
  seedTenant,
  seedUser,
} from './seed';

const DATABASE_URL = testDatabaseUrl;

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
    admin = new pg.Client({ connectionString: DATABASE_URL });
    await admin.connect();

    await seedUser(admin, userA, 'a');
    await seedUser(admin, userB, 'b');
    await seedUser(admin, memberA, 'm');

    await seedTenant(admin, tenantA);
    await seedTenant(admin, tenantB);

    await seedOrg(admin, tenantA, orgA, 'authz-a');
    await seedOrg(admin, tenantB, orgC, 'authz-c');

    await seedEntityHierarchy(admin, hierarchyA, tenantA, userA, 'authz-a');
    await seedEntityHierarchy(admin, hierarchyC, tenantB, userB, 'authz-c');

    await seedMembership(admin, tenantA, orgA, userA);
    await seedMembership(admin, tenantB, orgC, userB);
    await seedMembership(admin, tenantA, orgA, memberA, 'member');

    await seedAttachment(admin, attachmentA, tenantA, hierarchyA, userA);
    await seedAttachment(admin, attachmentM, tenantA, hierarchyA, memberA);
    await seedAttachment(admin, attachmentC, tenantB, hierarchyC, userB);
  });

  afterAll(async () => {
    await admin.query('DELETE FROM attachments WHERE id = ANY($1::uuid[])', [[attachmentA, attachmentM, attachmentC]]);
    // One transaction: the organization-keeps-an-admin check is deferred to commit, when the organizations are gone too.
    await admin.query('BEGIN');
    await admin.query('DELETE FROM memberships WHERE user_id = ANY($1::uuid[])', [[userA, userB, memberA]]);
    await cleanupEntityHierarchy(admin, [hierarchyA, hierarchyC]);
    await admin.query('DELETE FROM organizations WHERE id = ANY($1::uuid[])', [[orgA, orgC]]);
    await admin.query('COMMIT');
    await admin.query('DELETE FROM tenants WHERE id = ANY($1::text[])', [[tenantA, tenantB]]);
    await admin.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[userA, userB, memberA]]);
    await admin.query('DELETE FROM actors WHERE id = ANY($1::uuid[])', [[userA, userB, memberA]]);
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

  it('denies editing an entity in a tenant where the user has no membership', async () => {
    await expect(
      authorizeDoc(userA, requested({ entityId: attachmentC, tenantId: tenantB, organizationId: orgC })),
    ).resolves.toBeNull();
  });

  it('denies when the tenant param does not match the entity tenant (defense-in-depth)', async () => {
    await expect(
      authorizeDoc(userA, requested({ entityId: attachmentA, tenantId: tenantB, organizationId: orgA })),
    ).resolves.toBeNull();
  });

  it("must not authorize a request that names another tenant's organization", async () => {
    await expect(authorizeDoc(userA, requested({ entityId: attachmentA, organizationId: orgC }))).resolves.toBeNull();
  });

  it("must not let a member write another member's attachment through the relay", async () => {
    // Members update their own attachments only ('own' in the permission config).
    await expect(authorizeDoc(memberA, requested({ entityId: attachmentA }))).resolves.toBeNull();
    // Positive control: the member's own attachment.
    await expect(authorizeDoc(memberA, requested({ entityId: attachmentM }))).resolves.toEqual({
      entityType: 'attachment',
      entityId: attachmentM,
      tenantId: tenantA,
      organizationId: orgA,
    });
  });

  it('denies access to a non-existent entity', async () => {
    await expect(authorizeDoc(userA, requested({ entityId: randomUUID() }))).resolves.toBeNull();
  });
});
