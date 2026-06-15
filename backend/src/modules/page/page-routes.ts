import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/core/x-routes';
import { publicCache } from '#/middlewares/entity-cache';
import { authGuard, publicGuard, sysAdminGuard } from '#/middlewares/guard';
import { bulkPointsLimiter, singlePointsLimiter } from '#/middlewares/rate-limiter/limiters';
import {
  batchResponseSchema,
  errorResponseRefs,
  fullResponseQuerySchema,
  idsWithStxBodySchema,
  paginationSchema,
} from '#/schemas';
import { mockBatchPagesResponse, mockPageResponse, mockPaginatedPagesResponse } from './page-mocks';
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
    path: '/pages',
    xGuard: [authGuard, sysAdminGuard],
    xRateLimiter: [bulkPointsLimiter],
    tags: ['pages', 'cella', 'product'],
    summary: 'Create pages',
    description: 'Insert one or more new *pages*. Returns created pages and any rejected items.',
    request: {
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
    tags: ['pages', 'cella', 'product'],
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
    xCache: [publicCache('page')],
    tags: ['pages', 'cella', 'product'],
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
    path: '/pages/{id}',
    xGuard: [authGuard, sysAdminGuard],
    xRateLimiter: [singlePointsLimiter],
    tags: ['pages', 'cella', 'product'],
    summary: 'Update page',
    description: 'Update a single *page* by ID.',
    request: {
      params: z.object({ id: z.string() }),
      query: fullResponseQuerySchema,
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
    path: '/pages',
    xGuard: [authGuard, sysAdminGuard],
    xRateLimiter: [bulkPointsLimiter],
    tags: ['pages', 'cella', 'product'],
    summary: 'Delete pages',
    description: 'Delete one or more *pages* by ID.',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: idsWithStxBodySchema() } },
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
