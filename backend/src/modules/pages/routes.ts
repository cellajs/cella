import z from 'zod';
import { createCustomRoute } from '#/lib/custom-routes';
import { isAuthenticated, isPublicAccess, isSystemAdmin } from '#/middlewares/guard';
import { baseElectricSyncQuery, idsBodySchema, inOrgParamSchema } from '#/utils/schema/common';
import { errorResponseRefs } from '#/utils/schema/error-responses';
import { paginationSchema } from '#/utils/schema/success-responses';
import { pageCreateBodySchema, pageListQuerySchema, pageSchema, pageUpdateBodySchema } from './schema';

const pagesRoutes = {
  /**
   * Electric Shape Proxy
   */
  shapeProxy: createCustomRoute({
    operationId: 'shapeProxy',
    method: 'get',
    path: '/shape-proxy',
    guard: [isAuthenticated],
    tags: ['pages'],
    summary: 'Shape proxy',
    description: `Proxy requests to ElectricSQL's shape endpoint for the \`pages\` table.
      Used by clients to synchronize local data with server state via the shape log system.
      This endpoint ensures required query parameters are forwarded and response headers are adjusted for browser compatibility.`,
    request: { query: baseElectricSyncQuery, params: inOrgParamSchema },
    responses: {
      200: { description: 'Success' },
      ...errorResponseRefs,
    },
  }),
  /**
   * Create a page
   */
  createPage: createCustomRoute({
    operationId: 'createPage',
    method: 'post',
    path: '/',
    guard: [isAuthenticated, isSystemAdmin],
    tags: ['pages'],
    summary: 'Create pages',
    description: 'Insert one or more new *pages*.',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: pageCreateBodySchema } },
      },
    },
    responses: {
      201: {
        description: 'Page',
        content: {
          'application/json': {
            schema: pageSchema,
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Get pages
   */
  getPages: createCustomRoute({
    operationId: 'getPages',
    method: 'get',
    path: '/',
    guard: [isPublicAccess],
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
  getPage: createCustomRoute({
    operationId: 'getPage',
    method: 'get',
    path: '/{id}',
    guard: [isPublicAccess],
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
  updatePage: createCustomRoute({
    operationId: 'updatePage',
    method: 'put',
    path: '/{id}',
    guard: [isAuthenticated, isSystemAdmin],
    tags: ['pages'],
    summary: 'Update page',
    description: 'Update a single *page* by ID.',
    request: {
      params: z.object({
        id: z.string(),
      }),
      body: {
        required: true,
        content: { 'application/json': { schema: pageUpdateBodySchema } },
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
  deletePages: createCustomRoute({
    operationId: 'deletePages',
    method: 'delete',
    path: '/',
    guard: [isAuthenticated, isSystemAdmin],
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
