import { randomBytes } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import type { DomainModel } from '#/db/schema/domains';
import { env } from '#/env';
import { logEvent } from '#/utils/logger';

/**
 * DNS verification service for custom domains.
 * Handles generating verification tokens and checking DNS records.
 */

const resolver = new Resolver();
// Use public DNS servers for consistent resolution
resolver.setServers(['8.8.8.8', '1.1.1.1']);

/**
 * Generate a unique verification token for domain ownership
 */
export function generateVerificationToken(): string {
  return `cella-verify-${randomBytes(16).toString('hex')}`;
}

/**
 * Get DNS instructions for a domain
 */
export function getDnsInstructionsForDomain(domain: DomainModel): {
  domainId: string;
  fqdn: string;
  recordType: 'CNAME' | 'TXT';
  recordName: string;
  recordValue: string;
  instructions: string;
} {
  const edgeDomain = env.SCALEWAY_EDGE_DOMAIN ?? 'edge.scw.cloud';

  if (domain.type === 'apex') {
    // Apex domains need TXT record verification
    return {
      domainId: domain.id,
      fqdn: domain.fqdn,
      recordType: 'TXT',
      recordName: `_cella-verification.${domain.fqdn}`,
      recordValue: domain.verificationToken,
      instructions: `Add a TXT record to verify ownership:\n\nRecord Type: TXT\nHost/Name: _cella-verification\nValue: ${domain.verificationToken}\n\nNote: For apex domains, you may also need to set up A/AAAA records or use your DNS provider's ALIAS/ANAME feature.`,
    };
  }

  // Subdomains use CNAME verification
  const cnameTarget = domain.requiredCnameTarget ?? `${domain.repositoryId}.${edgeDomain}`;

  return {
    domainId: domain.id,
    fqdn: domain.fqdn,
    recordType: 'CNAME',
    recordName: domain.fqdn,
    recordValue: cnameTarget,
    instructions: `Add a CNAME record to point your subdomain:\n\nRecord Type: CNAME\nHost/Name: ${domain.fqdn.split('.')[0]}\nValue: ${cnameTarget}\n\nThis will route traffic through our Edge network and enable automatic SSL.`,
  };
}

/**
 * Verify domain DNS configuration
 */
export async function verifyDomainDns(domain: DomainModel): Promise<{
  verified: boolean;
  message: string;
}> {
  try {
    if (domain.type === 'apex') {
      return await verifyTxtRecord(domain);
    }
    return await verifyCnameRecord(domain);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'DNS lookup failed';
    logEvent('warn', 'DNS verification failed', { domainId: domain.id, error: message });
    return {
      verified: false,
      message: `DNS verification failed: ${message}`,
    };
  }
}

/**
 * Verify TXT record for apex domains
 */
async function verifyTxtRecord(domain: DomainModel): Promise<{
  verified: boolean;
  message: string;
}> {
  const recordName = `_cella-verification.${domain.fqdn}`;

  try {
    const records = await resolver.resolveTxt(recordName);

    // Flatten TXT records (they come as arrays of strings)
    const flatRecords = records.map((r) => r.join(''));

    if (flatRecords.includes(domain.verificationToken)) {
      logEvent('info', 'TXT verification successful', { domainId: domain.id, fqdn: domain.fqdn });
      return {
        verified: true,
        message: 'Domain ownership verified via TXT record',
      };
    }

    return {
      verified: false,
      message: `TXT record found but token doesn't match. Expected: ${domain.verificationToken}`,
    };
  } catch (error) {
    if (isNxDomainError(error)) {
      return {
        verified: false,
        message: `No TXT record found at ${recordName}. Please add the verification record.`,
      };
    }
    throw error;
  }
}

/**
 * Verify CNAME record for subdomains
 */
async function verifyCnameRecord(domain: DomainModel): Promise<{
  verified: boolean;
  message: string;
}> {
  const edgeDomain = env.SCALEWAY_EDGE_DOMAIN ?? 'edge.scw.cloud';
  const expectedTarget = domain.requiredCnameTarget ?? `${domain.repositoryId}.${edgeDomain}`;

  try {
    const records = await resolver.resolveCname(domain.fqdn);

    // Check if any CNAME points to our edge domain
    const hasValidCname = records.some((record) => {
      const normalizedRecord = record.toLowerCase().replace(/\.$/, '');
      const normalizedTarget = expectedTarget.toLowerCase();
      return normalizedRecord === normalizedTarget || normalizedRecord.endsWith(`.${edgeDomain}`);
    });

    if (hasValidCname) {
      logEvent('info', 'CNAME verification successful', { domainId: domain.id, fqdn: domain.fqdn });
      return {
        verified: true,
        message: 'Domain verified via CNAME record',
      };
    }

    return {
      verified: false,
      message: `CNAME record found but points to wrong target. Expected: ${expectedTarget}, Found: ${records.join(', ')}`,
    };
  } catch (error) {
    if (isNxDomainError(error)) {
      return {
        verified: false,
        message: `No CNAME record found for ${domain.fqdn}. Please add the DNS record.`,
      };
    }
    throw error;
  }
}

/**
 * Check if error is an NXDOMAIN (domain not found) error
 */
function isNxDomainError(error: unknown): boolean {
  return error instanceof Error && (error.message.includes('ENOTFOUND') || error.message.includes('ENODATA'));
}

/**
 * Verify SSL certificate status for a domain
 * This checks if the certificate has been provisioned by Edge Services
 */
export async function verifySslStatus(domain: DomainModel): Promise<{
  active: boolean;
  message: string;
}> {
  if (!domain.scalewayPipelineId) {
    return {
      active: false,
      message: 'Domain not configured in Edge Services',
    };
  }

  // Try to connect via HTTPS to verify SSL is working
  try {
    const response = await fetch(`https://${domain.fqdn}`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000),
    });

    return {
      active: true,
      message: `SSL certificate active (status: ${response.status})`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection failed';
    return {
      active: false,
      message: `SSL not yet active: ${message}`,
    };
  }
}

/**
 * Batch verify multiple domains (used by background worker)
 */
export async function batchVerifyDomains(domains: DomainModel[]): Promise<
  Array<{
    domainId: string;
    verified: boolean;
    message: string;
  }>
> {
  const results = await Promise.allSettled(domains.map((domain) => verifyDomainDns(domain)));

  return results.map((result, index) => ({
    domainId: domains[index].id,
    verified: result.status === 'fulfilled' ? result.value.verified : false,
    message: result.status === 'fulfilled' ? result.value.message : 'Verification failed',
  }));
}
