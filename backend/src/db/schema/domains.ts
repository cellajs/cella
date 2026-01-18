import { index, pgTable, varchar } from 'drizzle-orm/pg-core';
import { repositoriesTable } from '#/db/schema/repositories';
import { baseEntityColumns } from '#/db/utils/base-entity-columns';

/**
 * Domain type enum - subdomain or apex (root) domain.
 */
export const domainTypeEnum = ['subdomain', 'apex'] as const;
export type DomainType = (typeof domainTypeEnum)[number];

/**
 * Verification status for domain ownership.
 */
export const verificationStatusEnum = ['pending', 'verified', 'failed'] as const;
export type VerificationStatus = (typeof verificationStatusEnum)[number];

/**
 * SSL certificate provisioning status.
 */
export const sslStatusEnum = ['pending', 'provisioning', 'active', 'error'] as const;
export type SslStatus = (typeof sslStatusEnum)[number];

/**
 * Domains table to store custom domain configurations for repositories.
 */
export const domainsTable = pgTable(
  'domains',
  {
    ...baseEntityColumns('domain'),
    // Domain information
    fqdn: varchar().notNull(), // Fully qualified domain name (e.g., app.example.com)
    type: varchar({ enum: domainTypeEnum }).notNull().default('subdomain'),
    // Verification
    verificationStatus: varchar({ enum: verificationStatusEnum }).notNull().default('pending'),
    verificationToken: varchar().notNull(), // Token for DNS TXT record verification
    verificationMethod: varchar({ enum: ['cname', 'txt'] })
      .notNull()
      .default('txt'),
    lastVerificationAttempt: varchar(),
    verificationError: varchar(),
    // SSL/TLS
    sslStatus: varchar({ enum: sslStatusEnum }).notNull().default('pending'),
    sslError: varchar(),
    // Scaleway Edge configuration
    scalewayPipelineId: varchar(),
    scalewayDnsStageId: varchar(),
    scalewayTlsStageId: varchar(),
    // DNS instructions (cached for display)
    requiredCnameTarget: varchar(), // The CNAME target users need to point to
    // Parent repository
    repositoryId: varchar()
      .notNull()
      .references(() => repositoriesTable.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('domains_repository_id_index').on(table.repositoryId),
    index('domains_fqdn_index').on(table.fqdn),
    index('domains_verification_status_index').on(table.verificationStatus),
  ],
);

export type DomainModel = typeof domainsTable.$inferSelect;
export type InsertDomainModel = typeof domainsTable.$inferInsert;
