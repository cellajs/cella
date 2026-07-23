import { createXRoute } from '#/core/x-routes';
import { authGuard, orgGuard, tenantGuard } from '#/middlewares/guard';
import { productCache } from '#/middlewares/product-cache';
import {
  bulkPointsLimiter,
  presignedUrlLimiter,
  singlePointsLimiter,
  syncReadLimiter,
} from '#/middlewares/rate-limiter/limiters';
import {
  attachmentCreateManyStxBodySchema,
  attachmentCreateResponseSchema,
  attachmentListQuerySchema,
  attachmentSchema,
  attachmentUpdateStxBodySchema,
  presignedUrlItemSchema,
  presignedUrlsBodySchema,
} from '#/modules/attachment/attachment-schema';
import {
  batchResponseSchema,
  errorResponseRefs,
  fullResponseQuerySchema,
  idInTenantOrgParamSchema,
  idsWithStxBodySchema,
  paginationSchema,
  tenantOrgParamSchema,
} from '#/schemas';
import {
  mockAttachmentResponse,
  mockBatchAttachmentsResponse,
  mockPaginatedAttachmentsResponse,
} from './attachment-mocks';

const attachmentRoutes = {
  /**
   * Get list of attachments for an organization
   */
  getAttachments: createXRoute({
    operationId: 'getAttachments',
    method: 'get',
    path: '/',
    xGuard: [authGuard, tenantGuard, orgGuard],
    // Sync-driven read backpressure on the delta path (template pattern for fork product lists)
    xRateLimiter: [syncReadLimiter],
    tags: ['attachments', 'cella', 'product'],
    summary: 'Get attachments',
    description: 'Returns a paginated list of attachments for the organization.',
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
    xRateLimiter: [bulkPointsLimiter],
    tags: ['attachments', 'cella', 'product'],
    summary: 'Create attachments',
    description:
      'Registers one or more new attachments after client side upload. Includes metadata like name, type, and linked entity.',
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
    xCache: [productCache('attachment')],
    tags: ['attachments', 'cella', 'product'],
    summary: 'Get attachment',
    description: 'Returns a single attachment by ID. Served from the CDC-invalidated entity detail cache.',
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
    xRateLimiter: [singlePointsLimiter],
    tags: ['attachments', 'cella', 'product'],
    summary: 'Update attachment',
    description: 'Updates metadata of an attachment, such as its name or associated entity.',
    request: {
      params: idInTenantOrgParamSchema,
      query: fullResponseQuerySchema,
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
    xRateLimiter: [bulkPointsLimiter],
    tags: ['attachments', 'cella', 'product'],
    summary: 'Delete attachments',
    description: 'Deletes one or more attachment records by ID. This does not delete the underlying file in storage.',
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
   * Get presigned URLs for private attachments
   */
  getPresignedUrls: createXRoute({
    operationId: 'getPresignedUrls',
    method: 'post',
    path: '/presigned-urls',
    xGuard: [authGuard, tenantGuard, orgGuard],
    xRateLimiter: [presignedUrlLimiter],
    tags: ['attachments', 'cella', 'product'],
    summary: 'Get presigned URLs',
    description:
      'Signs download URLs for up to 50 private attachment files in one call, referenced by id + variant. Missing and denied ids come back in a uniform rejectedIds list (no 403/404 split), and the call succeeds even when every item is rejected. Public files should use the public CDN URL directly. Requires organization context.',
    request: {
      params: tenantOrgParamSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: presignedUrlsBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Presigned URLs',
        content: {
          'application/json': {
            schema: batchResponseSchema(presignedUrlItemSchema),
            example: {
              data: [
                {
                  attachmentId: '01890a5d-ac96-774b-b302-0f3e2ae14a2a',
                  variant: 'thumbnail',
                  url: 'https://bucket.s3.nl-ams.scw.cloud/key?X-Amz-Signature=…',
                },
              ],
              rejectedIds: [],
            },
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
};

export { attachmentRoutes };
