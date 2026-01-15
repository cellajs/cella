import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/docs/x-routes';
import { hasOrgAccess, isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import {
  attachmentCreateManySchema,
  attachmentSchema,
  attachmentUpdateBodySchema,
} from '#/modules/attachments/attachments-schema';
import {
  baseElectricSyncQuery,
  idInOrgParamSchema,
  idSchema,
  idsBodySchema,
  inOrgParamSchema,
} from '#/utils/schema/common';
import { errorResponseRefs } from '#/utils/schema/error-responses';
import { successWithRejectedItemsSchema } from '#/utils/schema/success-responses';

const attachmentRoutes = {
  /**
   * Create one or more attachments
   */
  createAttachments: createXRoute({
    operationId: 'createAttachment',
    method: 'post',
    path: '/',
    xGuard: [isAuthenticated, hasOrgAccess],
    tags: ['attachments'],
    summary: 'Create attachments',
    description:
      'Registers one or more new *attachments* after client side upload. Includes metadata like name, type, and linked entity.',
    request: {
      params: inOrgParamSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: attachmentCreateManySchema } },
      },
    },
    responses: {
      201: {
        description: 'Attachment',
        content: {
          'application/json': {
            schema: z.array(attachmentSchema),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Update an attachment
   */
  updateAttachment: createXRoute({
    operationId: 'updateAttachment',
    method: 'put',
    path: '/{id}',
    xGuard: [isAuthenticated, hasOrgAccess],
    tags: ['attachments'],
    summary: 'Update attachment',
    description: 'Updates metadata of an *attachment*, such as its name or associated entity.',
    request: {
      params: idInOrgParamSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: attachmentUpdateBodySchema } },
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
      ...errorResponseRefs,
    },
  }),
  /**
   * Delete one or more attachments
   */
  deleteAttachments: createXRoute({
    operationId: 'deleteAttachments',
    method: 'delete',
    path: '/',
    xGuard: [isAuthenticated, hasOrgAccess],
    tags: ['attachments'],
    summary: 'Delete attachments',
    description: 'Deletes one or more *attachment* records by ID. This does not delete the underlying file in storage.',
    request: {
      params: inOrgParamSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: idsBodySchema() } },
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
      ...errorResponseRefs,
    },
  }),
  /**
   * Sync attachments using Electric shape proxy
   */
  syncAttachments: createXRoute({
    operationId: 'syncAttachments',
    method: 'get',
    path: '/sync-attachments',
    xGuard: [isAuthenticated, hasOrgAccess],
    tags: ['attachments'],
    summary: 'Sync attachments',
    description: `Sync attachment data by proxying requests to ElectricSQL's shape endpoint for \`attachments\` table.
      Organization parameter is required to scope the data.`,
    request: { query: baseElectricSyncQuery, params: inOrgParamSchema },
    responses: {
      200: { description: 'Success' },
      ...errorResponseRefs,
    },
  }),
  /**
   * Redirect to attachment
   */
  redirectToAttachment: createXRoute({
    operationId: 'redirectToAttachment',
    method: 'get',
    path: '/{id}/link',
    xGuard: isPublicAccess,
    xRateLimiter: tokenLimiter('attachment_redirect'),
    tags: ['attachments'],
    summary: 'Redirect to attachment',
    description: "Redirects to the file's public or presigned URL, depending on storage visibility.",
    request: { params: z.object({ id: idSchema }) },
    responses: {
      200: { description: 'Success' },
      ...errorResponseRefs,
    },
  }),
};
export default attachmentRoutes;
