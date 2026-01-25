import z from 'zod';
import { createXRoute } from '#/docs/x-routes';
import { isAuthenticated, isPublicAccess, isSystemAdmin } from '#/middlewares/guard';
import { createStreamMessageSchema, errorResponseRefs, idsBodySchema, paginationSchema } from '#/schemas';
import {
  pageCreateResponseSchema,
  pageCreateTxBodySchema,
  pageListQuerySchema,
  pageSchema,
  pageUpdateTxBodySchema,
} from './page-schema';

/**
 * Query parameters for the public pages stream.
 */
const publicStreamQuerySchema = z.object({
  offset: z.string().optional().describe('Cursor offset: "-1" for all history, "now" for live-only, or activity ID'),
  live: z.enum(['sse']).optional().describe('Set to "sse" for live updates (SSE stream)'),
});

/**
 * Catch-up response for public pages stream.
 */
const publicStreamResponseSchema = z.object({
  activities: z.array(createStreamMessageSchema(z.unknown())),
  cursor: z.string().nullable().describe('Last activity ID (use as offset for next request)'),
});

const pagesRoutes = {
  /**
   * Public stream for page changes (no auth required)
   */
  publicStream: createXRoute({
    operationId: 'pagesPublicStream',
    method: 'get',
    path: '/stream',
    xGuard: isPublicAccess,
    tags: ['pages'],
    summary: 'Public stream of page changes',
    description:
      'Stream real-time changes for pages. No authentication required. Use offset for catch-up, live=sse for SSE streaming.',
    request: { query: publicStreamQuerySchema },
    responses: {
      200: {
        description: 'Catch-up activities or SSE stream started',
        content: {
          'application/json': {
            schema: publicStreamResponseSchema,
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Create one or more pages
   */
  createPages: createXRoute({
    operationId: 'createPages',
    method: 'post',
    path: '/',
    xGuard: [isAuthenticated, isSystemAdmin],
    tags: ['pages'],
    summary: 'Create pages',
    description: 'Insert one or more new *pages*. Returns created pages and any rejected items.',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: pageCreateTxBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Pages already created (idempotent)',
        content: {
          'application/json': {
            schema: pageCreateResponseSchema,
          },
        },
      },
      201: {
        description: 'Pages created',
        content: {
          'application/json': {
            schema: pageCreateResponseSchema,
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
    path: '/',
    xGuard: [isPublicAccess],
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
          'application/json': { schema: paginationSchema(pageSchema) },
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
    path: '/{id}',
    xGuard: [isPublicAccess],
    tags: ['pages'],
    summary: 'Get page',
    description: 'Get a single *page* by ID.',
    request: {
      params: z.object({
        id: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Page',
        content: { 'application/json': { schema: pageSchema } },
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
    path: '/{id}',
    xGuard: [isAuthenticated, isSystemAdmin],
    tags: ['pages'],
    summary: 'Update page',
    description: 'Update a single *page* by ID.',
    request: {
      params: z.object({
        id: z.string(),
      }),
      body: {
        required: true,
        content: { 'application/json': { schema: pageUpdateTxBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Page updated',
        content: { 'application/json': { schema: pageSchema } },
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
    path: '/',
    xGuard: [isAuthenticated, isSystemAdmin],
    tags: ['pages'],
    summary: 'Delete pages',
    description: 'Delete one or more *pages* by ID.',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: idsBodySchema() } },
      },
    },
    responses: {
      204: { description: 'Page(s) deleted' },
      ...errorResponseRefs,
    },
  }),
};

export default pagesRoutes;
