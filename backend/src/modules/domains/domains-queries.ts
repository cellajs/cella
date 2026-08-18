import { and, asc, eq } from 'drizzle-orm';
import type { AuthContext, DbContext } from '#/core/context';
import { domainsTable } from '#/modules/domains/domains-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';

export const findDomainsByTenant = async (ctx: AuthContext) => {
  const { db, tenantId } = ctx.var;
  return db.select().from(domainsTable).where(eq(domainsTable.tenantId, tenantId)).orderBy(asc(domainsTable.domain));
};

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

export const findDomainByName = async (ctx: DbContext, { domain }: FindDomainByNameOpts) => {
  const { db } = ctx.var;
  const [existing] = await db.select().from(domainsTable).where(eq(domainsTable.domain, domain)).limit(1);
  return existing;
};

interface InsertDomainOpts {
  domain: string;
}

export const insertDomain = async (ctx: AuthContext, { domain }: InsertDomainOpts) => {
  const { db, tenantId } = ctx.var;
  const [created] = await db.insert(domainsTable).values({ tenantId, domain }).returning();
  return created;
};

interface FindDomainByIdOpts {
  id: string;
}

export const findDomainById = async (ctx: AuthContext, { id }: FindDomainByIdOpts) => {
  const { db, tenantId } = ctx.var;
  const [domain] = await db
    .select()
    .from(domainsTable)
    .where(and(eq(domainsTable.id, id), eq(domainsTable.tenantId, tenantId)))
    .limit(1);
  return domain;
};

interface DeleteDomainOpts {
  id: string;
}

export const deleteDomain = async (ctx: AuthContext, { id }: DeleteDomainOpts) => {
  const { db, tenantId } = ctx.var;
  const [deleted] = await db
    .delete(domainsTable)
    .where(and(eq(domainsTable.id, id), eq(domainsTable.tenantId, tenantId)))
    .returning();
  return deleted;
};

interface UpdateDomainOpts {
  id: string;
  values: Pick<typeof domainsTable.$inferInsert, 'lastCheckedAt'> &
    Partial<Pick<typeof domainsTable.$inferInsert, 'verified' | 'verifiedAt'>>;
}

export const updateDomain = async (ctx: AuthContext, { id, values }: UpdateDomainOpts) => {
  const { db, tenantId } = ctx.var;
  const [updated] = await db
    .update(domainsTable)
    .set(values)
    .where(and(eq(domainsTable.id, id), eq(domainsTable.tenantId, tenantId)))
    .returning();
  return updated;
};
