import z from 'zod';
import { createCustomRoute } from '#/lib/custom-routes';
import { isAuthenticated } from '#/middlewares/guard';
import { baseElectrycSyncQuery, idsBodySchema, inOrgParamSchema } from '#/utils/schema/common';
import { errorResponseRefs } from '#/utils/schema/error-responses';
import { paginationSchema, successWithRejectedItemsSchema } from '#/utils/schema/success-responses';
import { pageListQuerySchema, pageSchema, pagesInsertManySchema, pageUpdateSchema } from './schema';

const pagesRoutes = {
  /**
   * Electric Shape Proxy?
   */
  shapeProxy: createCustomRoute({
    operationId: 'shapeProxy',
    method: 'get',
    path: '/shape-proxy',
    guard: [isAuthenticated], // hasOrgAccess
    tags: ['pages'],
    summary: 'Shape proxy',
    description: `Proxy requests to ElectricSQL's shape endpoint for the \`pages\` table.
      Used by clients to synchronize local data with server state via the shape log system.
      This endpoint ensures required query parameters are forwarded and response headers are adjusted for browser compatibility.`,
    request: { query: baseElectrycSyncQuery, params: inOrgParamSchema },
    responses: {
      200: { description: 'Success' },
      ...errorResponseRefs,
    },
  }),
  /**
   * Create Pages
   */
  createPages: createCustomRoute({
    operationId: 'createPages',
    method: 'post',
    path: '/',
    guard: [isAuthenticated], // hasOrgAccess
    tags: ['pages'],
    summary: 'Create pages',
    description: 'Insert one or more new *pages*.',
    request: {
      // params: inOrgParamSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: pagesInsertManySchema } },
      },
    },
    responses: {
      201: {
        description: 'Page(s)',
        content: {
          'application/json': {
            schema: pageSchema.array(),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Get Pages
   */
  getPages: createCustomRoute({
    operationId: 'getPages',
    method: 'get',
    path: '/',
    guard: [isAuthenticated], // hasOrgAccess?
    tags: ['pages'],
    summary: 'Get pages',
    description: 'Get all matching *pages*.',
    request: {
      // params: inOrgParamSchema,
      query: pageListQuerySchema,
    },
    responses: {
      200: {
        description: 'Pages',
        content: {
          'application/json': {
            schema: paginationSchema(pageSchema),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Get Page
   */
  getPage: createCustomRoute({
    operationId: 'getPage',
    method: 'get',
    path: '/{id}',
    guard: [isAuthenticated], // hasOrgAccess
    tags: ['pages'],
    summary: 'Get page',
    description: 'Get a single *page* by ID.',
    request: {
      // params: idInOrgParamSchema,
      params: z.object({
        id: z.string(),
      }),
    },
    responses: {
      200: {
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
   * Update Page
   */
  updatePage: createCustomRoute({
    operationId: 'updatePage',
    method: 'put',
    path: '/{id}',
    guard: [isAuthenticated], // hasOrgAccess
    tags: ['pages'],
    summary: 'Update page',
    description: 'Update a single *page* by ID.',
    request: {
      // params: idInOrgParamSchema,
      params: z.object({
        id: z.string(),
      }),
      body: {
        required: true,
        content: { 'application/json': { schema: pageUpdateSchema } },
      },
    },
    responses: {
      200: {
        description: 'Page updated',
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
   * Delete Page
   */
  deletePages: createCustomRoute({
    operationId: 'deletePages',
    method: 'delete',
    path: '/',
    guard: [isAuthenticated], // hasOrgAccess
    tags: ['pages'],
    summary: 'Delete pages',
    description: 'Delete one or more *pages* by ID.',
    request: {
      // params: idInOrgParamSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: idsBodySchema() } },
      },
    },
    responses: {
      200: {
        description: 'Page(s) deleted',
        content: {
          'application/json': {
            schema: successWithRejectedItemsSchema,
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
};

export default pagesRoutes;
