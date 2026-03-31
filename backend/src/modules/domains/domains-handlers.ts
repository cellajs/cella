import dns from 'node:dns/promises';
import { OpenAPIHono } from '@hono/zod-openapi';
import { type Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import {
  deleteDomain,
  findDomain,
  findDomainByName,
  findDomainsByTenant,
  findTenantExists,
  insertDomain,
  updateDomain,
} from '#/modules/domains/domains-queries';
import { defaultHook } from '#/utils/default-hook';
import { logEvent } from '#/utils/logger';
import domainRoutes from './domains-routes';

const app = new OpenAPIHono<Env>({ defaultHook });

/**
 * List domains for a tenant.
 */
app.openapi(domainRoutes.getDomains, async (ctx) => {
  const db = ctx.var.db;
  const { tenantId } = ctx.req.valid('param');

  const domains = await findDomainsByTenant(db, { tenantId });

  return ctx.json(domains);
});

/**
 * Add a domain to a tenant.
 */
app.openapi(domainRoutes.createDomain, async (ctx) => {
  const db = ctx.var.db;

  const { tenantId } = ctx.req.valid('param');
  const { domain } = ctx.req.valid('json');

  // Check tenant exists
  const tenant = await findTenantExists(db, { tenantId });
  if (!tenant) {
    throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'tenant' } });
  }

  // Check domain not already claimed
  const existing = await findDomainByName(db, { domain });
  if (existing) {
    throw new AppError(409, 'invalid_request', 'warn', { meta: { reason: 'Domain already claimed' } });
  }

  const created = await insertDomain(db, { tenantId, domain });

  logEvent(ctx, 'info', 'Domain added', { tenantId, domain });

  return ctx.json(created);
});

/**
 * Remove a domain from a tenant.
 */
app.openapi(domainRoutes.deleteDomain, async (ctx) => {
  const db = ctx.var.db;

  const { tenantId, id } = ctx.req.valid('param');

  const deleted = await deleteDomain(db, { id, tenantId });

  if (!deleted) {
    throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'domain' } });
  }

  logEvent(ctx, 'info', 'Domain removed', { tenantId, domain: deleted.domain });

  return ctx.json(deleted);
});

/**
 * Get a single domain with its verification token.
 */
app.openapi(domainRoutes.getDomain, async (ctx) => {
  const db = ctx.var.db;
  const { tenantId, id } = ctx.req.valid('param');

  const domain = await findDomain(db, { id, tenantId });

  if (!domain) {
    throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'domain' } });
  }

  return ctx.json(domain);
});

/**
 * Verify a domain via DNS TXT record lookup.
 */
app.openapi(domainRoutes.verifyDomain, async (ctx) => {
  const db = ctx.var.db;

  const { tenantId, id } = ctx.req.valid('param');

  const domain = await findDomain(db, { id, tenantId });

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
      logEvent(ctx, 'warn', 'DNS lookup failed', { domain: domain.domain, error: String(err) });
    }
  }

  const now = new Date().toISOString();
  const verified = recordsFound.includes(domain.verificationToken);

  const values = { lastCheckedAt: now, ...(verified ? { verified: true, verifiedAt: now } : {}) };
  const updated = await updateDomain(db, { id, values });

  logEvent(ctx, 'info', `Domain verification ${verified ? 'succeeded' : 'failed'}`, {
    tenantId,
    domain: domain.domain,
    verified,
  });

  const diagnostics = !verified ? { recordsFound, expectedToken: domain.verificationToken } : undefined;
  return ctx.json({ success: verified, domain: updated, ...(diagnostics && { diagnostics }) });
});

export const domainHandlers = app;
