import { z } from 'zod';
import { createCustomRoute } from '#/lib/custom-routes';
import { hasOrgAccess, isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { attachmentCreateManySchema, attachmentListQuerySchema, attachmentSchema, attachmentUpdateBodySchema } from '#/modules/attachments/schema';
import { idInOrgParamSchema, idSchema, idsBodySchema, inOrgParamSchema } from '#/utils/schema/common';
import { errorResponses, successWithDataSchema, successWithErrorsSchema, successWithPaginationSchema } from '#/utils/schema/responses';

const attachmentRoutes = {
  createAttachments: createCustomRoute({
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
            schema: successWithDataSchema(z.array(attachmentSchema)),
          },
        },
      },
      ...errorResponses,
    },
  }),
  getAttachments: createCustomRoute({
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
            schema: successWithPaginationSchema(attachmentSchema),
          },
        },
      },
      ...errorResponses,
    },
  }),
  getAttachment: createCustomRoute({
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
            schema: successWithDataSchema(attachmentSchema),
          },
        },
      },
      ...errorResponses,
    },
  }),
  updateAttachment: createCustomRoute({
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
            schema: successWithDataSchema(attachmentSchema),
          },
        },
      },
      ...errorResponses,
    },
  }),
  deleteAttachments: createCustomRoute({
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
