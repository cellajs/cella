import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/docs/x-routes';
import { hasOrgAccess, isAuthenticated } from '#/middlewares/guard';
import {
  connectRepositoryBodySchema,
  githubReposListSchema,
  repositoriesListSchema,
  repositorySchema,
  updateRepositoryBodySchema,
} from '#/modules/repositories/repositories-schema';
import { idInOrgParamSchema, inOrgParamSchema, paginationQuerySchema } from '#/utils/schema/common';
import { errorResponseRefs } from '#/utils/schema/error-responses';

const repositoriesRoutes = {
  /**
   * List user's available GitHub repositories (for connecting)
   */
  listGithubRepos: createXRoute({
    operationId: 'listGithubRepos',
    method: 'get',
    path: '/github-repos',
    xGuard: [isAuthenticated],
    tags: ['repositories'],
    summary: 'List GitHub repositories',
    description: "Lists the authenticated user's GitHub repositories available for connecting to the hosting platform.",
    request: {
      query: z.object({
        page: z
          .string()
          .optional()
          .transform((v) => (v ? Number.parseInt(v, 10) : 1)),
        perPage: z
          .string()
          .optional()
          .transform((v) => (v ? Number.parseInt(v, 10) : 30)),
      }),
    },
    responses: {
      200: {
        description: 'List of GitHub repositories',
        content: {
          'application/json': {
            schema: githubReposListSchema,
          },
        },
      },
      ...errorResponseRefs,
    },
  }),

  /**
   * Connect a GitHub repository to an organization
   */
  connectRepository: createXRoute({
    operationId: 'connectRepository',
    method: 'post',
    path: '/',
    xGuard: [isAuthenticated, hasOrgAccess],
    tags: ['repositories'],
    summary: 'Connect repository',
    description:
      'Connects a GitHub repository to the organization for static site hosting. Creates a webhook for automatic deployments.',
    request: {
      params: inOrgParamSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: connectRepositoryBodySchema } },
      },
    },
    responses: {
      201: {
        description: 'Repository connected successfully',
        content: {
          'application/json': {
            schema: repositorySchema,
          },
        },
      },
      ...errorResponseRefs,
    },
  }),

  /**
   * List repositories for an organization
   */
  listRepositories: createXRoute({
    operationId: 'listRepositories',
    method: 'get',
    path: '/',
    xGuard: [isAuthenticated, hasOrgAccess],
    tags: ['repositories'],
    summary: 'List repositories',
    description: 'Lists all connected repositories for an organization with deployment stats.',
    request: {
      params: inOrgParamSchema,
      query: paginationQuerySchema,
    },
    responses: {
      200: {
        description: 'List of repositories',
        content: {
          'application/json': {
            schema: repositoriesListSchema,
          },
        },
      },
      ...errorResponseRefs,
    },
  }),

  /**
   * Get a repository by ID
   */
  getRepository: createXRoute({
    operationId: 'getRepository',
    method: 'get',
    path: '/{id}',
    xGuard: [isAuthenticated, hasOrgAccess],
    tags: ['repositories'],
    summary: 'Get repository',
    description: 'Gets details of a connected repository including deployment history.',
    request: {
      params: idInOrgParamSchema,
    },
    responses: {
      200: {
        description: 'Repository details',
        content: {
          'application/json': {
            schema: repositorySchema,
          },
        },
      },
      ...errorResponseRefs,
    },
  }),

  /**
   * Update repository settings
   */
  updateRepository: createXRoute({
    operationId: 'updateRepository',
    method: 'put',
    path: '/{id}',
    xGuard: [isAuthenticated, hasOrgAccess],
    tags: ['repositories'],
    summary: 'Update repository',
    description: 'Updates repository settings like branch, build path, or active status.',
    request: {
      params: idInOrgParamSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: updateRepositoryBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Repository updated',
        content: {
          'application/json': {
            schema: repositorySchema,
          },
        },
      },
      ...errorResponseRefs,
    },
  }),

  /**
   * Disconnect (delete) a repository
   */
  disconnectRepository: createXRoute({
    operationId: 'disconnectRepository',
    method: 'delete',
    path: '/{id}',
    xGuard: [isAuthenticated, hasOrgAccess],
    tags: ['repositories'],
    summary: 'Disconnect repository',
    description: 'Disconnects a repository from hosting. Removes the GitHub webhook and cleans up hosting resources.',
    request: {
      params: idInOrgParamSchema,
    },
    responses: {
      200: {
        description: 'Repository disconnected',
        content: {
          'application/json': {
            schema: z.object({ success: z.boolean() }),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),

  /**
   * Trigger a manual deployment
   */
  triggerDeployment: createXRoute({
    operationId: 'triggerDeployment',
    method: 'post',
    path: '/{id}/deploy',
    xGuard: [isAuthenticated, hasOrgAccess],
    tags: ['repositories'],
    summary: 'Trigger deployment',
    description: 'Manually triggers a new deployment from the latest release or workflow artifact.',
    request: {
      params: idInOrgParamSchema,
      body: {
        required: false,
        content: {
          'application/json': {
            schema: z
              .object({
                source: z.enum(['release', 'workflow']).default('release'),
                commitSha: z.string().optional(), // Optional specific commit
              })
              .optional(),
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Deployment triggered',
        content: {
          'application/json': {
            schema: z.object({
              deploymentId: z.string(),
              status: z.string(),
            }),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
};

export default repositoriesRoutes;
