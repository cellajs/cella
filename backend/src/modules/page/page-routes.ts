import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/docs/x-routes';
import { publicCache } from '#/middlewares/entity-cache';
import { authGuard, publicGuard, sysAdminGuard, tenantGuard } from '#/middlewares/guard';
import { bulkPointsLimiter } from '#/middlewares/rate-limiter/limiters';
import {
  batchResponseSchema,
  errorResponseRefs,
  idsBodySchema,
  paginationSchema,
  tenantIdParamSchema,
  tenantOnlyParamSchema,
} from '#/schemas';
import { mockBatchPagesResponse, mockPageResponse, mockPaginatedPagesResponse } from '../../../mocks/mock-page';
import {
  pageCreateManyStxBodySchema,
  pageCreateResponseSchema,
  pageListQuerySchema,
  pageSchema,
  pageUpdateStxBodySchema,
} from './page-schema';

const pagesRoutes = {
  /**
   * Create one or more pages
   */
  createPages: createXRoute({
    operationId: 'createPages',
    method: 'post',
    path: '/{tenantId}/pages',
    xGuard: [authGuard, tenantGuard, sysAdminGuard],
    xRateLimiter: bulkPointsLimiter,
    tags: ['pages'],
    summary: 'Create pages',
    description: 'Insert one or more new *pages*. Returns created pages and any rejected items.',
    request: {
      params: tenantOnlyParamSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: pageCreateManyStxBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Pages already created (idempotent)',
        content: {
          'application/json': {
            schema: pageCreateResponseSchema,
            example: mockBatchPagesResponse(),
          },
        },
      },
      201: {
        description: 'Pages created',
        content: {
          'application/json': {
            schema: pageCreateResponseSchema,
            example: mockBatchPagesResponse(),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Get pages
   */
  getPages: createXRoute({
    operationId: 'getPages',
    method: 'get',
    path: '/pages',
    xGuard: [publicGuard],
    tags: ['pages'],
    summary: 'Get pages',
    description: 'Get all matching *pages*.',
    request: {
      query: pageListQuerySchema,
    },
    responses: {
      200: {
        description: 'Pages',
        content: {
          'application/json': { schema: paginationSchema(pageSchema), example: mockPaginatedPagesResponse() },
        },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Get page
   */
  getPage: createXRoute({
    operationId: 'getPage',
    method: 'get',
    path: '/pages/{id}',
    xGuard: [publicGuard],
    xCache: publicCache('page'),
    tags: ['pages'],
    summary: 'Get page',
    description: 'Get a single *page* by ID. Cached using LRU - first request warms cache.',
    request: {
      params: z.object({
        id: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Page',
        content: { 'application/json': { schema: pageSchema, example: mockPageResponse() } },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Update page
   */
  updatePage: createXRoute({
    operationId: 'updatePage',
    method: 'put',
    path: '/{tenantId}/pages/{id}',
    xGuard: [authGuard, tenantGuard, sysAdminGuard],
    tags: ['pages'],
    summary: 'Update page',
    description: 'Update a single *page* by ID.',
    request: {
      params: tenantIdParamSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: pageUpdateStxBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Page updated',
        content: { 'application/json': { schema: pageSchema, example: mockPageResponse() } },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Delete page
   */
  deletePages: createXRoute({
    operationId: 'deletePages',
    method: 'delete',
    path: '/{tenantId}/pages',
    xGuard: [authGuard, tenantGuard, sysAdminGuard],
    xRateLimiter: bulkPointsLimiter,
    tags: ['pages'],
    summary: 'Delete pages',
    description: 'Delete one or more *pages* by ID.',
    request: {
      params: tenantOnlyParamSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: idsBodySchema() } },
      },
    },
    responses: {
      200: {
        description: 'Success',
        content: { 'application/json': { schema: batchResponseSchema() } },
      },
      ...errorResponseRefs,
    },
  }),
};

export default pagesRoutes;
