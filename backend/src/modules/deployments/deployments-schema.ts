import { z } from '@hono/zod-openapi';
import { deploymentStatusEnum } from '#/db/schema/deployments';
import { paginationQuerySchema } from '#/utils/schema/common';

/** Zod schema for deployment log entry */
export const deploymentLogEntrySchema = z.object({
  timestamp: z.string(),
  level: z.enum(['info', 'warn', 'error', 'debug']),
  message: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Zod schema for deployment status enum */
export const deploymentStatusZodEnum = z.enum(deploymentStatusEnum);

/** Schema for a deployment object */
export const deploymentSchema = z.object({
  id: z.string(),
  commitSha: z.string().nullable(),
  branch: z.string(),
  status: deploymentStatusZodEnum,
  isActive: z.boolean(),
  artifactSource: z.enum(['release', 'workflow', 'manual']),
  artifactId: z.string().nullable(),
  s3Path: z.string().nullable(),
  deployedUrl: z.string().nullable(),
  logs: z.array(deploymentLogEntrySchema),
  triggeredBy: z.string().nullable(),
  repositoryId: z.string(),
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
});

/** Schema for triggering a manual deployment */
export const triggerDeploymentBodySchema = z.object({
  artifactSource: z.enum(['release', 'workflow', 'manual']).default('release'),
  artifactId: z.string().optional().openapi({ description: 'Release ID or workflow run ID' }),
  branch: z.string().optional().openapi({ description: 'Branch to deploy from (defaults to repo default branch)' }),
});

/** Schema for deployment list response */
export const deploymentsListSchema = z.object({
  items: z.array(deploymentSchema),
  total: z.number(),
});

/** Schema for deployment list query parameters */
export const deploymentListQuerySchema = paginationQuerySchema.extend({
  status: deploymentStatusZodEnum.optional().openapi({ description: 'Filter by deployment status' }),
  repositoryId: z.string().optional().openapi({ description: 'Filter by repository' }),
});

/** Schema for rollback request */
export const rollbackDeploymentBodySchema = z.object({
  deploymentId: z.string().openapi({ description: 'ID of the deployment to rollback to' }),
});

/** Schema for deployment with repository info */
export const deploymentWithRepositorySchema = deploymentSchema.extend({
  repository: z.object({
    id: z.string(),
    githubFullName: z.string(),
    defaultDomain: z.string().nullable(),
  }),
});

export type Deployment = z.infer<typeof deploymentSchema>;
export type DeploymentWithRepository = z.infer<typeof deploymentWithRepositorySchema>;
export type TriggerDeploymentBody = z.infer<typeof triggerDeploymentBodySchema>;
export type RollbackDeploymentBody = z.infer<typeof rollbackDeploymentBodySchema>;
