import { createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
import { actorGuard, orgGuard, tenantGuard } from '#/middlewares/guard';
import { productCache } from '#/middlewares/product-cache';
import { bulkPointsLimiter, presignedUrlLimiter, singlePointsLimiter, syncReadLimiter } from '#/middlewares/rate-limiter/limiters';
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
  mockPresignedUrlsResponse,
} from './attachment-mocks';

const attachmentRoutes = createXRoutes(['attachments', 'cella', 'product'], {
  getAttachments: xRoute({
    method: 'get',
    path: '/',
    xGuard: [actorGuard, tenantGuard, orgGuard],
    // Sync-driven read backpressure on the delta path (template pattern for app product lists)
    xRateLimiter: [syncReadLimiter],
    xTool: {
      description: 'List attachments of the organization with optional search, sorting and paging. Returns metadata and the description as text.',
      approvalRequired: false,
      entity: 'attachment',
    },
    summary: 'Get attachments',
    description: 'Returns a paginated list of attachments for the organization.',
    request: { params: tenantOrgParamSchema, query: attachmentListQuerySchema },
    responses: { 200: json('Attachments', paginationSchema(attachmentSchema), mockPaginatedAttachmentsResponse()) },
  }),
  createAttachments: xRoute({
    method: 'post',
    path: '/',
    xGuard: [actorGuard, tenantGuard, orgGuard],
    xRateLimiter: [bulkPointsLimiter],
    xTool: {
      description: 'Register already uploaded files as attachments. Give each a name, filename, MIME type, size and the storage key of the upload.',
      approvalRequired: true,
      entity: 'attachment',
    },
    summary: 'Create attachments',
    description: 'Registers one or more new attachments after client side upload. Includes metadata like name, type, and linked entity.',
    request: { params: tenantOrgParamSchema, body: jsonBody(attachmentCreateManyStxBodySchema) },
    responses: {
      200: json('Attachments already created (idempotent)', attachmentCreateResponseSchema, mockBatchAttachmentsResponse()),
      201: json('Attachments created', attachmentCreateResponseSchema, mockBatchAttachmentsResponse()),
    },
  }),
  getAttachment: xRoute({
    method: 'get',
    path: '/{id}',
    xGuard: [actorGuard, tenantGuard, orgGuard],
    xCache: [productCache('attachment')],
    xTool: {
      description: 'Read one attachment: its metadata and the description as text.',
      approvalRequired: false,
      entity: 'attachment',
    },
    summary: 'Get attachment',
    description: 'Returns a single attachment by ID. Served from the CDC-invalidated entity detail cache.',
    request: { params: idInTenantOrgParamSchema },
    responses: { 200: json('Attachment', attachmentSchema, mockAttachmentResponse()) },
  }),
  updateAttachment: xRoute({
    method: 'put',
    path: '/{id}',
    xGuard: [actorGuard, tenantGuard, orgGuard],
    xRateLimiter: [singlePointsLimiter],
    xTool: {
      description: 'Rename an attachment or replace its description.',
      approvalRequired: true,
      entity: 'attachment',
    },
    summary: 'Update attachment',
    description: 'Updates metadata of an attachment, such as its name or associated entity.',
    request: { params: idInTenantOrgParamSchema, query: fullResponseQuerySchema, body: jsonBody(attachmentUpdateStxBodySchema) },
    responses: { 200: json('Attachment was updated', attachmentSchema, mockAttachmentResponse()) },
  }),
  deleteAttachments: xRoute({
    method: 'delete',
    path: '/',
    xGuard: [actorGuard, tenantGuard, orgGuard],
    xRateLimiter: [bulkPointsLimiter],
    xTool: {
      description: 'Delete attachments by id. The stored files stay in storage.',
      approvalRequired: true,
      entity: 'attachment',
    },
    summary: 'Delete attachments',
    description: 'Deletes one or more attachment records by ID. This does not delete the underlying file in storage.',
    request: { params: tenantOrgParamSchema, body: jsonBody(idsWithStxBodySchema()) },
    responses: { 200: json('Success', batchResponseSchema()) },
  }),
  getPresignedUrls: xRoute({
    method: 'post',
    path: '/presigned-urls',
    xGuard: [actorGuard, tenantGuard, orgGuard],
    xRateLimiter: [presignedUrlLimiter],
    summary: 'Get presigned URLs',
    description:
      'Signs download URLs for up to 50 private attachment files in one call, referenced by id + variant. Missing and denied ids come back in a uniform rejectedIds list (no 403/404 split), and the call succeeds even when every item is rejected. Public files should use the public CDN URL directly. Requires organization context.',
    request: { params: tenantOrgParamSchema, body: jsonBody(presignedUrlsBodySchema) },
    responses: {
      200: json('Presigned URLs', batchResponseSchema(presignedUrlItemSchema), mockPresignedUrlsResponse()),
    },
  }),
});

export { attachmentRoutes };
