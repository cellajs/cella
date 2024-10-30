import { errorResponses, successWithDataSchema, successWithErrorsSchema, successWithPaginationSchema } from '#/utils/schema/common-responses';

import { createRouteConfig } from '#/lib/route-config';
import { hasOrgAccess, isAuthenticated, isPublicAccess } from '#/middlewares/guard';

import { z } from 'zod';
import { idOrSlugSchema, idSchema } from '#/utils/schema/common-schemas';
import { attachmentSchema, attachmentsQuerySchema, createAttachmentSchema, deleteAttachmentsQuerySchema } from './schema';

class AttachmentRoutesConfig {
  public createAttachment = createRouteConfig({
    method: 'post',
    path: '/',
    guard: isAuthenticated,
    tags: ['attachments'],
    summary: 'Create attachment',
    description: 'EXPERIMENTAL. Create a new attachment.',
    request: {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: createAttachmentSchema,
          },
        },
      },
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

  public deleteAttachments = createRouteConfig({
    method: 'delete',
    path: '/',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['attachments'],
    summary: 'Delete attachments',
    description: 'Delete attachments by their ids',
    request: {
      params: z.object({ orgIdOrSlug: idOrSlugSchema }),
      query: deleteAttachmentsQuerySchema,
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

  public redirectToAttachment = createRouteConfig({
    method: 'get',
    path: '/{id}/link',
    tags: ['attachments'],
    guard: [isPublicAccess],
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
    guard: [isPublicAccess],
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
export default new AttachmentRoutesConfig();
