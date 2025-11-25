import z from 'zod';
import { createCustomRoute } from '#/lib/custom-routes';
import { isAuthenticated } from '#/middlewares/guard';
import { baseElectrycSyncQuery, inOrgParamSchema } from '#/utils/schema/common';
import { errorResponseRefs } from '#/utils/schema/error-responses';
import { paginationSchema } from '#/utils/schema/success-responses';
import { pageListQuerySchema, pageSchema, pagesCreateManySchema } from './schema';

const pagesRoutes = {
  /**
   * Electric Shape Proxy
   */
  shapeProxy: createCustomRoute({
    operationId: 'shapeProxy',
    method: 'get',
    path: '/shape-proxy',
    guard: [isAuthenticated], // hasOrgAccess
    tags: ['pages'],
    summary: 'Shape proxy',
    description: `Proxies requests to ElectricSQL's shape endpoint for the \`pages\` table.
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
    description: 'Creates one or more new *pages*.',
    request: {
      // params: inOrgParamSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: pagesCreateManySchema } },
      },
    },
    responses: {
      201: {
        description: 'Pages',
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
    summary: 'Get list of pages',
    description: 'Retrieves all *pages* associated with a specific entity, such as an organization.',
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
    description: 'Fetches metadata and access details for a single *page* by ID.',
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
};

export default pagesRoutes;
