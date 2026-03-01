import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/docs/x-routes';
import { appCache } from '#/middlewares/entity-cache';
import { authGuard, orgGuard, publicGuard, tenantGuard } from '#/middlewares/guard';
import { httpCache } from '#/middlewares/http-cache';
import {
  bulkPointsLimiter,
  presignedUrlLimiter,
  singlePointsLimiter,
  tokenLimiter,
} from '#/middlewares/rate-limiter/limiters';
import {
  attachmentCreateManyStxBodySchema,
  attachmentCreateResponseSchema,
  attachmentListQuerySchema,
  attachmentSchema,
  attachmentUpdateStxBodySchema,
  presignedUrlKeySchema,
} from '#/modules/attachment/attachment-schema';
import {
  batchResponseSchema,
  errorResponseRefs,
  idInTenantOrgParamSchema,
  idsWithStxBodySchema,
  paginationSchema,
  tenantOrgParamSchema,
  validIdSchema,
} from '#/schemas';
import {
  mockAttachmentResponse,
  mockBatchAttachmentsResponse,
  mockPaginatedAttachmentsResponse,
} from '../../../mocks/mock-attachment';

const attachmentRoutes = {
  /**
   * Get list of attachments for an organization
   */
  getAttachments: createXRoute({
    operationId: 'getAttachments',
    method: 'get',
    path: '/',
    xGuard: [authGuard, tenantGuard, orgGuard],
    tags: ['attachments'],
    summary: 'Get attachments',
    description: 'Returns a paginated list of *attachments* for the organization.',
    request: {
      params: tenantOrgParamSchema,
      query: attachmentListQuerySchema,
    },
    responses: {
      200: {
        description: 'Attachments',
        content: {
          'application/json': {
            schema: paginationSchema(attachmentSchema),
            example: mockPaginatedAttachmentsResponse(),
          },
        },
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
    xGuard: [authGuard, tenantGuard, orgGuard],
    xRateLimiter: bulkPointsLimiter,
    tags: ['attachments'],
    summary: 'Create attachments',
    description:
      'Registers one or more new *attachments* after client side upload. Includes metadata like name, type, and linked entity.',
    request: {
      params: tenantOrgParamSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: attachmentCreateManyStxBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Attachments already created (idempotent)',
        content: {
          'application/json': { schema: attachmentCreateResponseSchema, example: mockBatchAttachmentsResponse() },
        },
      },
      201: {
        description: 'Attachments created',
        content: {
          'application/json': { schema: attachmentCreateResponseSchema, example: mockBatchAttachmentsResponse() },
        },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Get single attachment by ID
   */
  getAttachment: createXRoute({
    operationId: 'getAttachment',
    method: 'get',
    path: '/{id}',
    xGuard: [authGuard, tenantGuard, orgGuard],
    xCache: appCache(),
    tags: ['attachments'],
    summary: 'Get attachment',
    description: 'Returns a single *attachment* by ID. Supports CDC cache via X-Cache-Token header.',
    request: {
      params: idInTenantOrgParamSchema,
    },
    responses: {
      200: {
        description: 'Attachment',
        content: { 'application/json': { schema: attachmentSchema, example: mockAttachmentResponse() } },
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
    xGuard: [authGuard, tenantGuard, orgGuard],
    xRateLimiter: singlePointsLimiter,
    tags: ['attachments'],
    summary: 'Update attachment',
    description: 'Updates metadata of an *attachment*, such as its name or associated entity.',
    request: {
      params: idInTenantOrgParamSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: attachmentUpdateStxBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Attachment was updated',
        content: { 'application/json': { schema: attachmentSchema, example: mockAttachmentResponse() } },
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
    xGuard: [authGuard, tenantGuard, orgGuard],
    xRateLimiter: bulkPointsLimiter,
    tags: ['attachments'],
    summary: 'Delete attachments',
    description: 'Deletes one or more *attachment* records by ID. This does not delete the underlying file in storage.',
    request: {
      params: tenantOrgParamSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: idsWithStxBodySchema() } },
      },
    },
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: batchResponseSchema(),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Get attachment link page (OG meta + client-side redirect)
   */
  getAttachmentLink: createXRoute({
    operationId: 'getAttachmentLink',
    method: 'get',
    path: '/{id}/link',
    xGuard: publicGuard,
    xRateLimiter: tokenLimiter('attachment_redirect'),
    xCache: httpCache({ scope: 'public', maxAge: 3600 }),
    tags: ['attachments'],
    summary: 'Get attachment link',
    description:
      'Returns an HTML page with OG meta tags for link previews and a client-side redirect to the attachment in the app.',
    request: { params: z.object({ id: validIdSchema }) },
    responses: {
      200: { description: 'Success' },
      ...errorResponseRefs,
    },
  }),
  /**
   * Get presigned URL for private attachment
   */
  getPresignedUrl: createXRoute({
    operationId: 'getPresignedUrl',
    method: 'get',
    path: '/presigned-url',
    xGuard: [authGuard, tenantGuard, orgGuard],
    xRateLimiter: presignedUrlLimiter,
    xCache: httpCache({ scope: 'private', maxAge: 3600 }),
    tags: ['attachments'],
    summary: 'Get presigned URL',
    description:
      'Generates and returns a presigned URL for accessing a private attachment file in S3. Public files should use the public CDN URL directly. Requires organization context.',
    request: { params: tenantOrgParamSchema, query: presignedUrlKeySchema },
    responses: {
      200: {
        description: 'Presigned URL',
        content: { 'application/json': { schema: z.string() } },
      },
      ...errorResponseRefs,
    },
  }),
};
export default attachmentRoutes;
