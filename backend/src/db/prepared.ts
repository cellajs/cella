import { eq, sql } from 'drizzle-orm';
import { activitiesTable } from '#/modules/activities/activities-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { baseDb } from './db';

const hasDb = typeof baseDb.select === 'function';

/** Builds the statement only when a connection exists; without one the first use throws, naming it. */
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

export const findTenantById = prepared('find_tenant_by_id', () =>
  baseDb
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, sql.placeholder('id')))
    .limit(1)
    .prepare('find_tenant_by_id'),
);

// Idempotency (sync engine)

export const findActivityByMutationId = prepared('find_activity_by_mutation_id', () =>
  baseDb
    .select({ id: activitiesTable.id })
    .from(activitiesTable)
    .where(sql`${activitiesTable.stx}->>'mutationId' = ${sql.placeholder('mutationId')}`)
    .limit(1)
    .prepare('find_activity_by_mutation_id'),
);

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
