import { z } from '@hono/zod-openapi';
import { createCustomRoute } from '#/lib/custom-routes';
import { hasOrgAccess, isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { attachmentCreateManySchema, attachmentListQuerySchema, attachmentSchema, attachmentUpdateBodySchema } from '#/modules/attachments/schema';
import { baseElectrycSyncQuery, idInOrgParamSchema, idSchema, idsBodySchema, inOrgParamSchema } from '#/utils/schema/common';
import { errorResponses, paginationSchema, successWithRejectedItemsSchema } from '#/utils/schema/responses';

const attachmentRoutes = {
  createAttachments: createCustomRoute({
    operationId: 'createAttachment',
    method: 'post',
    path: '/',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['attachments'],
    summary: 'Create attachments',
    description: 'Registers one or more new *attachments* after client side upload. Includes metadata like name, type, and linked entity.',
    request: {
      params: inOrgParamSchema,
      body: {
        required: true,
        content: {
          'application/json': {
            schema: attachmentCreateManySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Attachment',
        content: {
          'application/json': {
            schema: z.array(attachmentSchema),
          },
        },
      },
      ...errorResponses,
    },
  }),
  getAttachments: createCustomRoute({
    operationId: 'getAttachments',
    method: 'get',
    path: '/',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['attachments'],
    summary: 'Get list of attachments',
    description: 'Retrieves all *attachments* associated with a specific entity, such as an organization.',
    request: {
      params: inOrgParamSchema,
      query: attachmentListQuerySchema,
    },
    responses: {
      200: {
        description: 'Attachments',
        content: {
          'application/json': {
            schema: paginationSchema(attachmentSchema),
          },
        },
      },
      ...errorResponses,
    },
  }),
  getAttachment: createCustomRoute({
    operationId: 'getAttachment',
    method: 'get',
    path: '/{id}',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['attachments'],
    summary: 'Get attachment',
    description: 'Fetches metadata and access details for a single *attachment* by ID.',
    request: {
      params: idInOrgParamSchema,
    },
    responses: {
      200: {
        description: 'Attachment',
        content: {
          'application/json': {
            schema: attachmentSchema,
          },
        },
      },
      ...errorResponses,
    },
  }),
  updateAttachment: createCustomRoute({
    operationId: 'updateAttachment',
    method: 'put',
    path: '/{id}',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['attachments'],
    summary: 'Update attachment',
    description: 'Updates metadata of an *attachment*, such as its name or associated entity.',
    request: {
      params: idInOrgParamSchema,
      body: {
        content: {
          'application/json': {
            schema: attachmentUpdateBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Attachment was updated',
        content: {
          'application/json': {
            schema: attachmentSchema,
          },
        },
      },
      ...errorResponses,
    },
  }),
  deleteAttachments: createCustomRoute({
    operationId: 'deleteAttachments',
    method: 'delete',
    path: '/',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['attachments'],
    summary: 'Delete attachments',
    description: 'Deletes one or more *attachment* records by ID. This does not delete the underlying file in storage.',
    request: {
      params: inOrgParamSchema,
      body: {
        content: {
          'application/json': {
            schema: idsBodySchema(),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: successWithRejectedItemsSchema,
          },
        },
      },
      ...errorResponses,
    },
  }),
  shapeProxy: createCustomRoute({
    operationId: 'shapeProxy',
    method: 'get',
    path: '/shape-proxy',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['attachments'],
    summary: 'Shape proxy',
    description: `Proxies requests to ElectricSQL's shape endpoint for the \`attachments\` table.
      Used by clients to synchronize local data with server state via the shape log system.
      This endpoint ensures required query parameters are forwarded and response headers are adjusted for browser compatibility.`,
    request: { query: baseElectrycSyncQuery, params: inOrgParamSchema },
    responses: {
      200: {
        description: 'Success',
      },
      ...errorResponses,
    },
  }),
  redirectToAttachment: createCustomRoute({
    operationId: 'redirectToAttachment',
    method: 'get',
    path: '/{id}/link',
    guard: isPublicAccess,
    tags: ['attachments'],
    summary: 'Redirect to attachment',
    description: "Redirects to the file's public or presigned URL, depending on storage visibility.",
    request: {
      params: z.object({ id: idSchema }),
    },
    responses: {
      200: {
        description: 'Success',
      },
      ...errorResponses,
    },
  }),
};
export default attachmentRoutes;
