import { boolean, index, integer, pgTable, varchar } from 'drizzle-orm/pg-core';
import { organizationsTable } from '#/db/schema/organizations';
import { productEntityColumns } from '#/db/utils/product-entity-columns';

/**
 * Repositories table to store connected GitHub repositories for static site hosting.
 */
export const repositoriesTable = pgTable(
  'repositories',
  {
    ...productEntityColumns('repository'),
    // GitHub repository information
    githubRepoId: integer().notNull(),
    githubRepoName: varchar().notNull(),
    githubOwner: varchar().notNull(),
    githubFullName: varchar().notNull(), // owner/repo format
    githubDefaultBranch: varchar().notNull().default('main'),
    // Build configuration
    branch: varchar().notNull().default('main'),
    buildArtifactPath: varchar().notNull().default('dist'),
    // Scaleway hosting configuration
    s3BucketName: varchar(),
    scalewayPipelineId: varchar(),
    scalewayBackendStageId: varchar(),
    scalewayDnsStageId: varchar(),
    defaultDomain: varchar(), // auto-generated subdomain like repo-xxx.yourapp.com
    // Webhook configuration
    webhookId: integer(),
    webhookSecret: varchar(),
    // Status
    isActive: boolean().notNull().default(true),
    lastDeployedAt: varchar(),
    // Context entity
    organizationId: varchar()
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('repositories_organization_id_index').on(table.organizationId),
    index('repositories_github_repo_id_index').on(table.githubRepoId),
  ],
);

export type RepositoryModel = typeof repositoriesTable.$inferSelect;
export type InsertRepositoryModel = typeof repositoriesTable.$inferInsert;
