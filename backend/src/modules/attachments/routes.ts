import { z } from '@hono/zod-openapi';
import { createCustomRoute } from '#/lib/custom-routes';
import { hasOrgAccess, isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { attachmentCreateManySchema, attachmentListQuerySchema, attachmentSchema, attachmentUpdateBodySchema } from '#/modules/attachments/schema';
import { idInOrgParamSchema, idSchema, idsBodySchema, inOrgParamSchema } from '#/utils/schema/common';
import { errorResponses, paginationSchema, successWithErrorsSchema } from '#/utils/schema/responses';

const attachmentRoutes = {
  createAttachments: createCustomRoute({
    operationId: 'createAttachment',
    method: 'post',
    path: '/',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['attachments'],
    summary: 'Create attachments',
    description: 'Create one or more new attachments.',
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
    description: 'Get attachments for an organization.',
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
    description: 'Get an attachment by id.',
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
    description: 'Update attachment by id.',
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
    description: 'Delete attachments by their ids',
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
            schema: successWithErrorsSchema(),
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
    description: 'Get shape proxy for attachments to keep attachment data in sync.',
    request: { params: inOrgParamSchema },
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
    tags: ['attachments'],
    guard: isPublicAccess,
    summary: 'Redirect to attachment',
    description: 'Redirect to attachment by id.',
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
  getAttachmentCover: createCustomRoute({
    operationId: 'getAttachmentCover',
    method: 'get',
    path: '/{id}/cover',
    guard: isPublicAccess,
    tags: ['attachments'],
    summary: 'Get attachment cover',
    description: 'Get attachment cover image by id.',
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
