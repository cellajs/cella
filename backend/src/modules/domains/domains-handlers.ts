import { OpenAPIHono } from '@hono/zod-openapi';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '#/db/db';
import { domainsTable } from '#/db/schema/domains';
import { repositoriesTable } from '#/db/schema/repositories';
import type { Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { createDnsStage, updateDnsStage } from '#/lib/scaleway-edge';
import {
  generateVerificationToken,
  getDnsInstructionsForDomain,
  verifyDomainDns,
} from '#/modules/domains/dns-verification';
import domainsRoutes from '#/modules/domains/domains-routes';
import { defaultHook } from '#/utils/default-hook';
import { logEvent } from '#/utils/logger';

const app = new OpenAPIHono<Env>({ defaultHook });

/**
 * List all domains with optional filters
 */
app.openapi(domainsRoutes.listDomains, async (ctx) => {
  const { limit, offset, repositoryId, verificationStatus } = ctx.req.valid('query');

  const conditions = [];
  if (repositoryId) conditions.push(eq(domainsTable.repositoryId, repositoryId));
  if (verificationStatus) conditions.push(eq(domainsTable.verificationStatus, verificationStatus));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const domains = await db
    .select()
    .from(domainsTable)
    .where(whereClause)
    .orderBy(desc(domainsTable.createdAt))
    .limit(limit ?? 50)
    .offset(offset ?? 0);

  // Get total count
  const [countResult] = await db
    .select({ count: db.$count(domainsTable) })
    .from(domainsTable)
    .where(whereClause);

  return ctx.json(
    {
      items: domains.map(toDomainResponse),
      total: countResult?.count ?? 0,
    },
    200,
  );
});

/**
 * Get a specific domain
 */
app.openapi(domainsRoutes.getDomain, async (ctx) => {
  const { domainId } = ctx.req.valid('param');

  const [domain] = await db.select().from(domainsTable).where(eq(domainsTable.id, domainId));

  if (!domain) {
    throw new AppError(404, 'not_found', 'warn');
  }

  return ctx.json(toDomainResponse(domain), 200);
});

/**
 * Add a custom domain to a repository
 */
app.openapi(domainsRoutes.addDomain, async (ctx) => {
  const { fqdn, repositoryId } = ctx.req.valid('json');

  // Verify repository exists
  const [repository] = await db.select().from(repositoriesTable).where(eq(repositoriesTable.id, repositoryId));

  if (!repository) {
    throw new AppError(404, 'not_found', 'warn');
  }

  // Check if domain already exists
  const [existingDomain] = await db.select().from(domainsTable).where(eq(domainsTable.fqdn, fqdn.toLowerCase()));

  if (existingDomain) {
    throw new AppError(409, 'duplicate_creation', 'warn');
  }

  // Determine domain type (subdomain vs apex)
  const domainParts = fqdn.split('.');
  const isApex = domainParts.length === 2;

  // Generate verification token
  const verificationToken = generateVerificationToken();

  // Create domain record
  const [domain] = await db
    .insert(domainsTable)
    .values({
      name: fqdn.toLowerCase(),
      fqdn: fqdn.toLowerCase(),
      type: isApex ? 'apex' : 'subdomain',
      verificationStatus: 'pending',
      verificationToken,
      verificationMethod: isApex ? 'txt' : 'cname',
      sslStatus: 'pending',
      repositoryId,
    })
    .returning();

  logEvent('info', 'Domain added', { domainId: domain.id, fqdn, repositoryId });

  // Return DNS instructions
  const instructions = getDnsInstructionsForDomain(domain);

  return ctx.json(instructions, 200);
});

/**
 * Get DNS setup instructions for a domain
 */
app.openapi(domainsRoutes.getDnsInstructions, async (ctx) => {
  const { domainId } = ctx.req.valid('param');

  const [domain] = await db.select().from(domainsTable).where(eq(domainsTable.id, domainId));

  if (!domain) {
    throw new AppError(404, 'not_found', 'warn');
  }

  const instructions = getDnsInstructionsForDomain(domain);
  return ctx.json(instructions, 200);
});

/**
 * Trigger domain verification
 */
app.openapi(domainsRoutes.verifyDomain, async (ctx) => {
  const { domainId } = ctx.req.valid('param');

  const [domain] = await db.select().from(domainsTable).where(eq(domainsTable.id, domainId));

  if (!domain) {
    throw new AppError(404, 'not_found', 'warn');
  }

  // Perform DNS verification
  const result = await verifyDomainDns(domain);

  // Update domain status
  await db
    .update(domainsTable)
    .set({
      verificationStatus: result.verified ? 'verified' : 'pending',
      lastVerificationAttempt: new Date().toISOString(),
      verificationError: result.verified ? null : result.message,
    })
    .where(eq(domainsTable.id, domainId));

  // If verified, configure Edge Services
  if (result.verified) {
    try {
      const [repository] = await db
        .select()
        .from(repositoriesTable)
        .where(eq(repositoriesTable.id, domain.repositoryId));

      if (repository?.scalewayPipelineId) {
        // Add domain to existing pipeline DNS stage
        if (domain.scalewayDnsStageId) {
          await updateDnsStage(domain.scalewayDnsStageId, [domain.fqdn]);
        } else {
          const dnsStage = await createDnsStage({
            pipelineId: repository.scalewayPipelineId,
            fqdns: [domain.fqdn],
          });

          await db
            .update(domainsTable)
            .set({
              scalewayPipelineId: repository.scalewayPipelineId,
              scalewayDnsStageId: dnsStage.id,
              sslStatus: 'provisioning',
            })
            .where(eq(domainsTable.id, domainId));
        }

        logEvent('info', 'Domain configured in Edge Services', { domainId, fqdn: domain.fqdn });
      }
    } catch (error) {
      logEvent('error', 'Failed to configure domain in Edge Services', { domainId, error });
    }
  }

  return ctx.json(
    {
      domainId,
      verified: result.verified,
      status: result.verified ? 'verified' : 'pending',
      message: result.message,
    },
    200,
  );
});

/**
 * Remove a custom domain
 */
app.openapi(domainsRoutes.removeDomain, async (ctx) => {
  const { domainId } = ctx.req.valid('param');

  const [domain] = await db.select().from(domainsTable).where(eq(domainsTable.id, domainId));

  if (!domain) {
    throw new AppError(404, 'not_found', 'warn');
  }

  // TODO: Remove from Edge Services DNS stage if configured

  await db.delete(domainsTable).where(eq(domainsTable.id, domainId));

  logEvent('info', 'Domain removed', { domainId, fqdn: domain.fqdn });

  return ctx.json({ success: true }, 200);
});

/**
 * Transform domain model to API response
 */
function toDomainResponse(domain: typeof domainsTable.$inferSelect) {
  return {
    id: domain.id,
    fqdn: domain.fqdn,
    type: domain.type,
    verificationStatus: domain.verificationStatus,
    verificationToken: domain.verificationToken,
    verificationMethod: domain.verificationMethod,
    sslStatus: domain.sslStatus,
    scalewayPipelineId: domain.scalewayPipelineId,
    scalewayDnsStageId: domain.scalewayDnsStageId,
    repositoryId: domain.repositoryId,
    createdAt: domain.createdAt,
    modifiedAt: domain.modifiedAt,
  };
}

export default app;
