import { eq, sql } from 'drizzle-orm';
import { activitiesTable } from '#/modules/activities/activities-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { baseDb } from './db';

const hasDb = typeof baseDb.select === 'function';

// Tenant guard

/** Prepared tenant lookup by tenant id, omitted when baseDb is a stub. */
export const findTenantById = hasDb
  ? baseDb
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, sql.placeholder('id')))
      .limit(1)
      .prepare('find_tenant_by_id')
  : (undefined as never);

// Idempotency (sync engine)

/** Prepared activity lookup by sync transaction mutation id. */
export const findActivityByMutationId = hasDb
  ? baseDb
      .select({ id: activitiesTable.id })
      .from(activitiesTable)
      .where(sql`${activitiesTable.stx}->>'mutationId' = ${sql.placeholder('mutationId')}`)
      .limit(1)
      .prepare('find_activity_by_mutation_id')
  : (undefined as never);

/** Prepared activity reference lookup by sync transaction mutation id. */
export const findActivityRefByMutationId = hasDb
  ? baseDb
      .select({
        entityType: activitiesTable.entityType,
        subjectId: activitiesTable.subjectId,
      })
      .from(activitiesTable)
      .where(sql`${activitiesTable.stx}->>'mutationId' = ${sql.placeholder('mutationId')}`)
      .limit(1)
      .prepare('find_activity_ref_by_mutation_id')
  : (undefined as never);
