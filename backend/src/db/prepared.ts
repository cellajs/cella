import { eq, sql } from 'drizzle-orm';
import { baseDb } from '#/db/db';
import { tenantsTable } from '#/modules/tenants/tenants-db';

const hasDb = typeof baseDb.select === 'function';

/** Builds the statement only when a connection exists; without one the first use throws, naming it. */
const prepared = <T extends object>(name: string, build: () => T): T => {
  if (hasDb) return build();
  return new Proxy({} as T, {
    get() {
      throw new Error(`Prepared statement "${name}" is unavailable: this process runs without a database connection (NODB).`);
    },
  });
};

/** The tenant row of an id (`execute({ id })`), at most one; read through `loadTenant`, which caches it. */
export const findTenantById = prepared('find_tenant_by_id', () =>
  baseDb
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, sql.placeholder('id')))
    .limit(1)
    .prepare('find_tenant_by_id'),
);
