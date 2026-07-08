import { and, asc, eq } from 'drizzle-orm';
import type { AuthContext, DbContext } from '#/core/context';
import { domainsTable } from '#/modules/domains/domains-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';

/** List all domains for a tenant, ordered by domain name. */
export const findDomainsByTenant = async (ctx: AuthContext) => {
  const { db, tenantId } = ctx.var;
  return db.select().from(domainsTable).where(eq(domainsTable.tenantId, tenantId)).orderBy(asc(domainsTable.domain));
};

/** Check that a tenant exists. Returns the tenant ID or undefined. */
export const findTenantExists = async (ctx: AuthContext) => {
  const { db, tenantId } = ctx.var;
  const [tenant] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);
  return tenant;
};

interface FindDomainByNameOpts {
  domain: string;
}

/** Find a domain by its domain name (uniqueness check). */
export const findDomainByName = async (ctx: DbContext, { domain }: FindDomainByNameOpts) => {
  const { db } = ctx.var;
  const [existing] = await db.select().from(domainsTable).where(eq(domainsTable.domain, domain)).limit(1);
  return existing;
};

interface InsertDomainOpts {
  domain: string;
}

/** Insert a new domain and return the created row. */
export const insertDomain = async (ctx: AuthContext, { domain }: InsertDomainOpts) => {
  const { db, tenantId } = ctx.var;
  const [created] = await db.insert(domainsTable).values({ tenantId, domain }).returning();
  return created;
};

interface FindDomainOpts {
  id: string;
}

/** Find a domain by ID and tenant. */
export const findDomain = async (ctx: AuthContext, { id }: FindDomainOpts) => {
  const { db, tenantId } = ctx.var;
  const [domain] = await db
    .select()
    .from(domainsTable)
    .where(and(eq(domainsTable.id, id), eq(domainsTable.tenantId, tenantId)))
    .limit(1);
  return domain;
};

/** Delete a domain by ID and tenant. Returns the deleted row. */
export const deleteDomain = async (ctx: AuthContext, { id }: FindDomainOpts) => {
  const { db, tenantId } = ctx.var;
  const [deleted] = await db
    .delete(domainsTable)
    .where(and(eq(domainsTable.id, id), eq(domainsTable.tenantId, tenantId)))
    .returning();
  return deleted;
};

interface UpdateDomainOpts {
  id: string;
  values: Partial<typeof domainsTable.$inferInsert>;
}

/** Update a domain by ID and return the updated row. */
export const updateDomain = async (ctx: DbContext, { id, values }: UpdateDomainOpts) => {
  const { db } = ctx.var;
  const [updated] = await db.update(domainsTable).set(values).where(eq(domainsTable.id, id)).returning();
  return updated;
};
