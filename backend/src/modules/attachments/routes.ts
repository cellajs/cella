import { z } from 'zod';
import { createRouteConfig } from '#/lib/route-config';
import { hasOrgAccess, isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { errorResponses, successWithDataSchema, successWithErrorsSchema, successWithPaginationSchema } from '#/utils/schema/common-responses';
import { idOrSlugSchema, idSchema, idsBodySchema, productParamSchema } from '#/utils/schema/common-schemas';
import { attachmentSchema, attachmentsQuerySchema, createAttachmentsSchema, updateAttachmentBodySchema } from './schema';

class AttachmentRouteConfig {
  public createAttachments = createRouteConfig({
    method: 'post',
    path: '/',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['attachments'],
    summary: 'Create attachments',
    description: 'Create one or more new attachments.',
    request: {
      params: z.object({ orgIdOrSlug: idOrSlugSchema }),
      body: {
        required: true,
        content: {
          'application/json': {
            schema: createAttachmentsSchema,
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
  });

  public getAttachments = createRouteConfig({
    method: 'get',
    path: '/',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['attachments'],
    summary: 'Get list of attachments',
    description: 'Get attachments for an organization.',
    request: {
      query: attachmentsQuerySchema,
      params: z.object({
        orgIdOrSlug: idOrSlugSchema.optional(),
      }),
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
  });

  public getAttachment = createRouteConfig({
    method: 'get',
    path: '/{id}',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['attachments'],
    summary: 'Get attachment',
    description: 'Get an attachment by id.',
    request: {
      params: productParamSchema,
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
  });

  public updateAttachment = createRouteConfig({
    method: 'put',
    path: '/{id}',
    guard: [isAuthenticated],
    tags: ['attachments'],
    summary: 'Update attachment',
    description: 'Update attachment by id.',
    request: {
      params: z.object({
        orgIdOrSlug: idOrSlugSchema.optional(),
        id: idSchema,
      }),
      body: {
        content: {
          'application/json': {
            schema: updateAttachmentBodySchema,
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
  });

  public deleteAttachments = createRouteConfig({
    method: 'delete',
    path: '/',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['attachments'],
    summary: 'Delete attachments',
    description: 'Delete attachments by their ids',
    request: {
      params: z.object({ orgIdOrSlug: idOrSlugSchema }),
      body: {
        content: { 'application/json': { schema: idsBodySchema } },
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
  });

  public shapeProxy = createRouteConfig({
    method: 'get',
    path: '/shape-proxy',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['attachments'],
    summary: 'Shape proxy',
    description: 'Get shape proxy for attachment.',
    request: {
      params: z.object({ orgIdOrSlug: idOrSlugSchema }),
    },
    responses: {
      200: {
        description: 'Success',
      },
      ...errorResponses,
    },
  });

  public redirectToAttachment = createRouteConfig({
    method: 'get',
    path: '/{id}/link',
    tags: ['attachments'],
    guard: isPublicAccess,
    summary: 'Redirect to attachment',
    description: 'Redirect to attachment by id.',
    request: {
      params: z.object({
        id: idSchema,
      }),
    },
    responses: {
      200: {
        description: 'Success',
      },
      ...errorResponses,
    },
  });

  public getAttachmentCover = createRouteConfig({
    method: 'get',
    path: '/{id}/cover',
    guard: isPublicAccess,
    tags: ['attachments'],
    summary: 'Get attachment cover',
    description: 'Get attachment cover image by id.',
    request: {
      params: z.object({
        id: idSchema,
      }),
    },
    responses: {
      200: {
        description: 'Success',
      },
      ...errorResponses,
    },
  });
}
export default new AttachmentRouteConfig();
