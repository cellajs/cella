import { boolean, index, jsonb, pgTable, varchar } from 'drizzle-orm/pg-core';
import { repositoriesTable } from '#/db/schema/repositories';
import { usersTable } from '#/db/schema/users';
import { baseEntityColumns } from '#/db/utils/base-entity-columns';
import { timestampColumns } from '#/db/utils/timestamp-columns';

/**
 * Deployment status enum values.
 */
export const deploymentStatusEnum = [
  'pending',
  'downloading',
  'uploading',
  'deploying',
  'deployed',
  'failed',
  'rolled_back',
] as const;
export type DeploymentStatus = (typeof deploymentStatusEnum)[number];

/**
 * Log entry structure for deployment logs stored as JSONB.
 */
export type DeploymentLogEntry = {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  metadata?: Record<string, unknown>;
};

/**
 * Deployments table to track deployment history for repositories.
 */
export const deploymentsTable = pgTable(
  'deployments',
  {
    ...baseEntityColumns('deployment'),
    // Git information
    commitSha: varchar().notNull(),
    commitMessage: varchar(),
    branch: varchar().notNull(),
    // Deployment status
    status: varchar({ enum: deploymentStatusEnum }).notNull().default('pending'),
    isActive: boolean().notNull().default(false),
    // Artifact information
    artifactSource: varchar({ enum: ['release', 'workflow', 'manual'] })
      .notNull()
      .default('release'),
    artifactUrl: varchar(),
    // Hosting information
    s3Path: varchar(),
    deployedUrl: varchar(),
    // Timing
    startedAt: timestampColumns.createdAt,
    completedAt: varchar(),
    // Logs stored as JSONB array of log entries
    logs: jsonb().$type<DeploymentLogEntry[]>().notNull().default([]),
    // Error tracking
    errorMessage: varchar(),
    // Audit
    triggeredBy: varchar().references(() => usersTable.id, { onDelete: 'set null' }),
    // Parent repository
    repositoryId: varchar()
      .notNull()
      .references(() => repositoriesTable.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('deployments_repository_id_index').on(table.repositoryId),
    index('deployments_status_index').on(table.status),
    index('deployments_is_active_index').on(table.isActive),
    index('deployments_created_at_index').on(table.createdAt),
  ],
);

export type DeploymentModel = typeof deploymentsTable.$inferSelect;
export type InsertDeploymentModel = typeof deploymentsTable.$inferInsert;
