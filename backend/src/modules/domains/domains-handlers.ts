import dns from 'node:dns/promises';
import { OpenAPIHono } from '@hono/zod-openapi';
import { and, asc, eq } from 'drizzle-orm';
import { domainsTable } from '#/db/schema/domains';
import { tenantsTable } from '#/db/schema/tenants';
import { type Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { defaultHook } from '#/utils/default-hook';
import { logEvent } from '#/utils/logger';
import domainRoutes from './domains-routes';

const app = new OpenAPIHono<Env>({ defaultHook });

const domainHandlers = app
  /**
   * List domains for a tenant.
   */
  .openapi(domainRoutes.getDomains, async (ctx) => {
    const db = ctx.var.db;
    const { tenantId } = ctx.req.valid('param');

    const domains = await db
      .select()
      .from(domainsTable)
      .where(eq(domainsTable.tenantId, tenantId))
      .orderBy(asc(domainsTable.domain));

    return ctx.json(domains);
  })

  /**
   * Add a domain to a tenant.
   */
  .openapi(domainRoutes.createDomain, async (ctx) => {
    const db = ctx.var.db;
    const { tenantId } = ctx.req.valid('param');
    const { domain } = ctx.req.valid('json');
    const user = ctx.var.user;

    // Check tenant exists
    const [tenant] = await db
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId))
      .limit(1);
    if (!tenant) {
      throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'tenant' } });
    }

    // Check domain not already claimed
    const [existing] = await db.select().from(domainsTable).where(eq(domainsTable.domain, domain)).limit(1);
    if (existing) {
      throw new AppError(409, 'invalid_request', 'warn', { meta: { reason: 'Domain already claimed' } });
    }

    const [created] = await db.insert(domainsTable).values({ tenantId, domain }).returning();

    logEvent('info', 'Domain added', { tenantId, domain, addedBy: user.id });

    return ctx.json(created);
  })

  /**
   * Remove a domain from a tenant.
   */
  .openapi(domainRoutes.deleteDomain, async (ctx) => {
    const db = ctx.var.db;
    const { tenantId, id } = ctx.req.valid('param');
    const user = ctx.var.user;

    const [deleted] = await db
      .delete(domainsTable)
      .where(and(eq(domainsTable.id, id), eq(domainsTable.tenantId, tenantId)))
      .returning();

    if (!deleted) {
      throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'domain' } });
    }

    logEvent('info', 'Domain removed', { tenantId, domain: deleted.domain, removedBy: user.id });

    return ctx.json(deleted);
  })

  /**
   * Get a single domain with its verification token.
   */
  .openapi(domainRoutes.getDomain, async (ctx) => {
    const db = ctx.var.db;
    const { tenantId, id } = ctx.req.valid('param');

    const [domain] = await db
      .select()
      .from(domainsTable)
      .where(and(eq(domainsTable.id, id), eq(domainsTable.tenantId, tenantId)))
      .limit(1);

    if (!domain) {
      throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'domain' } });
    }

    return ctx.json(domain);
  })

  /**
   * Verify a domain via DNS TXT record lookup.
   */
  .openapi(domainRoutes.verifyDomain, async (ctx) => {
    const db = ctx.var.db;
    const { tenantId, id } = ctx.req.valid('param');
    const user = ctx.var.user;

    const [domain] = await db
      .select()
      .from(domainsTable)
      .where(and(eq(domainsTable.id, id), eq(domainsTable.tenantId, tenantId)))
      .limit(1);

    if (!domain) {
      throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'domain' } });
    }

    if (!domain.verificationToken) {
      throw new AppError(422, 'invalid_request', 'warn', { meta: { reason: 'Domain has no verification token' } });
    }

    const hostname = `_cella-verification.${domain.domain}`;
    let recordsFound: string[] = [];

    try {
      const txtRecords = await dns.resolveTxt(hostname);
      // dns.resolveTxt returns string[][] — each record is an array of chunks, join them
      recordsFound = txtRecords.map((chunks) => chunks.join(''));
    } catch (err: unknown) {
      // ENOTFOUND / ENODATA means no TXT records exist — not an error
      const code = err instanceof Error && 'code' in err ? (err as NodeJS.ErrnoException).code : undefined;
      if (code !== 'ENOTFOUND' && code !== 'ENODATA') {
        logEvent('warn', 'DNS lookup failed', { domain: domain.domain, error: String(err) });
      }
    }

    const now = new Date().toISOString();
    const verified = recordsFound.includes(domain.verificationToken);

    const [updated] = await db
      .update(domainsTable)
      .set({
        lastCheckedAt: now,
        ...(verified ? { verified: true, verifiedAt: now } : {}),
      })
      .where(eq(domainsTable.id, id))
      .returning();

    logEvent('info', `Domain verification ${verified ? 'succeeded' : 'failed'}`, {
      tenantId,
      domain: domain.domain,
      verified,
      verifiedBy: user.id,
    });

    return ctx.json({
      success: verified,
      domain: updated,
      ...(!verified ? { diagnostics: { recordsFound, expectedToken: domain.verificationToken } } : {}),
    });
  });

export default domainHandlers;
