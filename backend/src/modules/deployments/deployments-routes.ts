import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/docs/x-routes';
import { isAuthenticated } from '#/middlewares/guard';
import {
  deploymentListQuerySchema,
  deploymentSchema,
  deploymentsListSchema,
  deploymentWithRepositorySchema,
  rollbackDeploymentBodySchema,
  triggerDeploymentBodySchema,
} from '#/modules/deployments/deployments-schema';
import { idSchema } from '#/utils/schema/common';
import { errorResponseRefs } from '#/utils/schema/error-responses';

const deploymentsRoutes = {
  /**
   * List all deployments for an organization or repository
   */
  listDeployments: createXRoute({
    operationId: 'listDeployments',
    method: 'get',
    path: '/',
    xGuard: isAuthenticated,
    tags: ['deployments'],
    summary: 'List deployments',
    description: 'Returns a paginated list of deployments, optionally filtered by repository or status.',
    request: {
      query: deploymentListQuerySchema,
    },
    responses: {
      200: {
        description: 'List of deployments',
        content: {
          'application/json': {
            schema: deploymentsListSchema,
          },
        },
      },
      ...errorResponseRefs,
    },
  }),

  /**
   * Get a specific deployment by ID
   */
  getDeployment: createXRoute({
    operationId: 'getDeployment',
    method: 'get',
    path: '/{deploymentId}',
    xGuard: isAuthenticated,
    tags: ['deployments'],
    summary: 'Get deployment',
    description: 'Returns detailed information about a specific deployment including logs.',
    request: {
      params: z.object({
        deploymentId: idSchema,
      }),
    },
    responses: {
      200: {
        description: 'Deployment details',
        content: {
          'application/json': {
            schema: deploymentWithRepositorySchema,
          },
        },
      },
      ...errorResponseRefs,
    },
  }),

  /**
   * Trigger a new deployment for a repository
   */
  triggerDeployment: createXRoute({
    operationId: 'triggerDeployment',
    method: 'post',
    path: '/repositories/{repositoryId}/trigger',
    xGuard: isAuthenticated,
    tags: ['deployments'],
    summary: 'Trigger deployment',
    description: 'Manually triggers a new deployment for a repository.',
    request: {
      params: z.object({
        repositoryId: idSchema,
      }),
      body: {
        required: true,
        content: {
          'application/json': {
            schema: triggerDeploymentBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Deployment triggered',
        content: {
          'application/json': {
            schema: deploymentSchema,
          },
        },
      },
      ...errorResponseRefs,
    },
  }),

  /**
   * Rollback to a previous deployment
   */
  rollbackDeployment: createXRoute({
    operationId: 'rollbackDeployment',
    method: 'post',
    path: '/repositories/{repositoryId}/rollback',
    xGuard: isAuthenticated,
    tags: ['deployments'],
    summary: 'Rollback deployment',
    description: 'Rolls back to a previous deployment by making it the active deployment.',
    request: {
      params: z.object({
        repositoryId: idSchema,
      }),
      body: {
        required: true,
        content: {
          'application/json': {
            schema: rollbackDeploymentBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Rollback successful',
        content: {
          'application/json': {
            schema: deploymentSchema,
          },
        },
      },
      ...errorResponseRefs,
    },
  }),

  /**
   * Cancel a pending deployment
   */
  cancelDeployment: createXRoute({
    operationId: 'cancelDeployment',
    method: 'post',
    path: '/{deploymentId}/cancel',
    xGuard: isAuthenticated,
    tags: ['deployments'],
    summary: 'Cancel deployment',
    description: 'Cancels a pending or in-progress deployment.',
    request: {
      params: z.object({
        deploymentId: idSchema,
      }),
    },
    responses: {
      200: {
        description: 'Deployment cancelled',
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
   * Get deployment logs
   */
  getDeploymentLogs: createXRoute({
    operationId: 'getDeploymentLogs',
    method: 'get',
    path: '/{deploymentId}/logs',
    xGuard: isAuthenticated,
    tags: ['deployments'],
    summary: 'Get deployment logs',
    description: 'Returns the logs for a specific deployment.',
    request: {
      params: z.object({
        deploymentId: idSchema,
      }),
      query: z.object({
        level: z.enum(['info', 'warn', 'error', 'debug']).optional(),
        after: z.string().optional().openapi({ description: 'Return logs after this timestamp' }),
      }),
    },
    responses: {
      200: {
        description: 'Deployment logs',
        content: {
          'application/json': {
            schema: z.object({
              deploymentId: z.string(),
              logs: z.array(
                z.object({
                  timestamp: z.string(),
                  level: z.enum(['info', 'warn', 'error', 'debug']),
                  message: z.string(),
                  metadata: z.record(z.string(), z.unknown()).optional(),
                }),
              ),
            }),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
};

export default deploymentsRoutes;
