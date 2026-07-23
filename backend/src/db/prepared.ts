import { eq, sql } from 'drizzle-orm';
import { activitiesTable } from '#/modules/activities/activities-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { baseDb } from './db';

const hasDb = typeof baseDb.select === 'function';

/**
 * Build a prepared statement, or a stand-in that throws on use when `NODB` is set.
 * The statement is only built when a connection exists. Without one, the first `.execute()`
 * throws an error naming the statement that was reached.
 */
const prepared = <T extends object>(name: string, build: () => T): T => {
  if (hasDb) return build();
  return new Proxy({} as T, {
    get() {
      throw new Error(
        `Prepared statement "${name}" is unavailable: this process runs without a database connection (NODB).`,
      );
    },
  });
};

// Tenant guard

/** Prepared tenant lookup by tenant id. */
export const findTenantById = prepared('find_tenant_by_id', () =>
  baseDb
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, sql.placeholder('id')))
    .limit(1)
    .prepare('find_tenant_by_id'),
);

// Idempotency (sync engine)

/** Prepared activity lookup by sync transaction mutation id. */
export const findActivityByMutationId = prepared('find_activity_by_mutation_id', () =>
  baseDb
    .select({ id: activitiesTable.id })
    .from(activitiesTable)
    .where(sql`${activitiesTable.stx}->>'mutationId' = ${sql.placeholder('mutationId')}`)
    .limit(1)
    .prepare('find_activity_by_mutation_id'),
);

/** Prepared activity reference lookup by sync transaction mutation id. */
export const findActivityRefByMutationId = prepared('find_activity_ref_by_mutation_id', () =>
  baseDb
    .select({
      entityType: activitiesTable.entityType,
      subjectId: activitiesTable.subjectId,
    })
    .from(activitiesTable)
    .where(sql`${activitiesTable.stx}->>'mutationId' = ${sql.placeholder('mutationId')}`)
    .limit(1)
    .prepare('find_activity_ref_by_mutation_id'),
);
