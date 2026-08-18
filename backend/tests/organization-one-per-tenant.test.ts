/**
 * 1 tenant = 1 organization: the unique constraint on organizations.tenant_id is the DB-level
 * backstop for the create-organizations guard. Requires PostgreSQL (core mode or higher).
 */

import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { mockOrganization } from '#/modules/organization/organization-mocks';
import { createTestOrganization } from './helpers';
import { clearDatabase } from './test-utils';

afterEach(async () => await clearDatabase());

describe('one organization per tenant', () => {
  it('rejects a second organization in the same tenant', async () => {
    const org = await createTestOrganization();

    // A second org pinned to the same tenant must violate organizations_tenant_id_key.
    const second = mockOrganization();
    await expect(db.insert(organizationsTable).values({ ...second, tenantId: org.tenantId })).rejects.toThrow();
  });

  it('allows one organization per distinct tenant', async () => {
    const a = await createTestOrganization();
    const b = await createTestOrganization();
    expect(a.tenantId).not.toBe(b.tenantId);
    expect(a.id).not.toBe(b.id);
  });
});
