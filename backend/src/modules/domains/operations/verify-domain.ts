import dns from 'node:dns/promises';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { findDomain, updateDomain } from '#/modules/domains/domains-queries';
import { logEvent } from '#/utils/logger';

export async function verifyDomainOp(ctx: AuthContext, id: string) {
  const tenantId = ctx.var.tenantId;

  const domain = await findDomain(ctx, { id });

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
  const updated = await updateDomain(ctx, { id, values });

  logEvent(ctx, 'info', `Domain verification ${verified ? 'succeeded' : 'failed'}`, {
    tenantId,
    domain: domain.domain,
    verified,
  });

  const diagnostics = !verified ? { recordsFound, expectedToken: domain.verificationToken } : undefined;
  return { success: verified, domain: updated, ...(diagnostics && { diagnostics }) };
}
