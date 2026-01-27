import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/docs/x-routes';
import { hasOrgAccess, isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import {
  attachmentCreateManyTxBodySchema,
  attachmentCreateResponseSchema,
  attachmentListQuerySchema,
  attachmentSchema,
  attachmentUpdateTxBodySchema,
} from '#/modules/attachment/attachment-schema';
import {
  errorResponseRefs,
  idInOrgParamSchema,
  idSchema,
  idsBodySchema,
  inOrgParamSchema,
  paginationSchema,
  successWithRejectedItemsSchema,
} from '#/schemas';

const attachmentRoutes = {
  /**
   * Get list of attachments for an organization
   */
  getAttachments: createXRoute({
    operationId: 'getAttachments',
    method: 'get',
    path: '/',
    xGuard: [isAuthenticated, hasOrgAccess],
    tags: ['attachments'],
    summary: 'Get attachments',
    description: 'Returns a paginated list of *attachments* for the organization.',
    request: {
      params: inOrgParamSchema,
      query: attachmentListQuerySchema,
    },
    responses: {
      200: {
        description: 'Attachments',
        content: { 'application/json': { schema: paginationSchema(attachmentSchema) } },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Create one or more attachments
   */
  createAttachments: createXRoute({
    operationId: 'createAttachments',
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
        content: { 'application/json': { schema: attachmentCreateManyTxBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Attachments already created (idempotent)',
        content: { 'application/json': { schema: attachmentCreateResponseSchema } },
      },
      201: {
        description: 'Attachments created',
        content: { 'application/json': { schema: attachmentCreateResponseSchema } },
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
        content: { 'application/json': { schema: attachmentUpdateTxBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Attachment was updated',
        content: { 'application/json': { schema: attachmentSchema } },
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
