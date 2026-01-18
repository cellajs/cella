import { z } from '@hono/zod-openapi';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { repositoriesTable } from '#/db/schema/repositories';

const repositoryInsertSchema = createInsertSchema(repositoriesTable);
const repositorySelectSchema = createSelectSchema(repositoriesTable);

/**
 * Repository entity schema for API responses.
 */
export const repositorySchema = z.object(repositorySelectSchema.shape).openapi('Repository', {
  example: {
    id: 'repo_abc123',
    entityType: 'repository',
    name: 'my-website',
    description: 'My personal website',
    keywords: 'website, portfolio',
    createdAt: '2024-01-01T00:00:00Z',
    modifiedAt: '2024-01-01T00:00:00Z',
    createdBy: 'user_xyz',
    modifiedBy: 'user_xyz',
    githubRepoId: 123456789,
    githubRepoName: 'my-website',
    githubOwner: 'username',
    githubFullName: 'username/my-website',
    githubDefaultBranch: 'main',
    branch: 'main',
    buildArtifactPath: 'dist',
    s3BucketName: 'hosting-repo_abc123',
    scalewayPipelineId: 'pipeline_123',
    defaultDomain: 'abc12345.edge.scw.cloud',
    webhookId: 987654321,
    webhookSecret: null, // Hidden in responses
    isActive: true,
    lastDeployedAt: '2024-01-15T12:00:00Z',
    organizationId: 'org_123',
  },
});

/**
 * Schema for connecting a new GitHub repository.
 */
export const connectRepositoryBodySchema = z.object({
  githubRepoId: z.number().int().positive(),
  githubRepoName: z.string().min(1).max(100),
  githubOwner: z.string().min(1).max(100),
  githubFullName: z.string().min(1).max(201), // owner/repo format
  githubDefaultBranch: z.string().min(1).max(100).default('main'),
  branch: z.string().min(1).max(100).default('main'),
  buildArtifactPath: z.string().min(1).max(200).default('dist'),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

/**
 * Schema for updating repository settings.
 */
export const updateRepositoryBodySchema = repositoryInsertSchema
  .pick({
    name: true,
    description: true,
    branch: true,
    buildArtifactPath: true,
    isActive: true,
  })
  .partial();

/**
 * Schema for GitHub repo list response (user's available repos).
 */
export const githubRepoSchema = z.object({
  id: z.number(),
  name: z.string(),
  fullName: z.string(),
  owner: z.string(),
  defaultBranch: z.string(),
  private: z.boolean(),
  description: z.string().nullable(),
  htmlUrl: z.string(),
});

export const githubReposListSchema = z.array(githubRepoSchema);

/**
 * Schema for repository list response with deployment count.
 */
export const repositoryWithStatsSchema = repositorySchema.extend({
  deploymentCount: z.number().optional(),
  lastDeployment: z
    .object({
      id: z.string(),
      status: z.string(),
      commitSha: z.string(),
      createdAt: z.string(),
    })
    .nullable()
    .optional(),
});

export const repositoriesListSchema = z.array(repositoryWithStatsSchema);
