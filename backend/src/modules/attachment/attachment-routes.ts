import { createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
import { actorGuard, orgGuard, tenantGuard } from '#/middlewares/guard';
import { productCache } from '#/middlewares/product-cache';
import { bulkPointsLimiter, presignedUrlLimiter, singlePointsLimiter, syncReadLimiter } from '#/middlewares/rate-limiter/limiters';
import {
  mockBatchAttachmentsResponse,
  mockCreateAttachmentsBody,
  mockDeleteAttachmentsBody,
  mockLinkAttachmentKeysBody,
  mockPaginatedAttachmentsResponse,
  mockPresignedUrlsBody,
  mockPresignedUrlsResponse,
  mockUpdateAttachmentBody,
} from '#/modules/attachment/attachment-mocks';
import {
  attachmentCreateManyStxBodySchema,
  attachmentCreateResponseSchema,
  attachmentLinkKeysBodySchema,
  attachmentListQuerySchema,
  attachmentPresignedUrlSchema,
  attachmentPresignedUrlsBodySchema,
  attachmentSchema,
  attachmentUpdateStxBodySchema,
} from '#/modules/attachment/attachment-schema';
import { batchResponseSchema, idInTenantOrgParamSchema, idsWithStxBodySchema, paginationSchema, tenantOrgParamSchema } from '#/schemas';

const attachmentRoutes = createXRoutes(['attachments', 'cella', 'product'], {
  getAttachments: xRoute({
    method: 'get',
    path: '/',
    xGuard: [actorGuard, tenantGuard, orgGuard],
    // Sync-driven read backpressure on the range-read path (template pattern for app product lists)
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
    xScope: 'attachment:write',
    xRateLimiter: [bulkPointsLimiter],
    summary: 'Create attachments',
    description:
      "Registers one or more new attachments after client side upload. Includes metadata like name, type, and linked entity. Every storage key must lie under the caller's own upload prefix and name a stored object; the size comes from storage.",
    request: { params: tenantOrgParamSchema, body: jsonBody(attachmentCreateManyStxBodySchema, mockCreateAttachmentsBody()) },
    responses: {
      200: json(
        'Nothing created: rows an earlier attempt created (idempotent), and rejected ids',
        attachmentCreateResponseSchema,
        mockBatchAttachmentsResponse(),
      ),
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
    description: 'Returns a single attachment by ID. Served from the entity detail cache, which every write to the row drops.',
    request: { params: idInTenantOrgParamSchema },
    responses: { 200: json('Attachment', attachmentSchema) },
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
    description: 'Renames an attachment or replaces its description.',
    request: { params: idInTenantOrgParamSchema, body: jsonBody(attachmentUpdateStxBodySchema, mockUpdateAttachmentBody()) },
    responses: { 200: json('Attachment was updated', attachmentSchema) },
  }),
  linkAttachmentKeys: xRoute({
    method: 'put',
    path: '/{id}/keys',
    xGuard: [actorGuard, tenantGuard, orgGuard],
    // Linking the stored variants of a file needs read access only.
    xScope: 'attachment:read',
    xRateLimiter: [singlePointsLimiter],
    summary: 'Link attachment keys',
    description:
      'Stores the storage keys of a file its uploader uploaded after creating the attachment, offline or before cloud storage was configured. Only the uploader may link them, under their own upload prefix, and only while the attachment has no stored file. Repeating the same keys returns the attachment unchanged.',
    request: { params: idInTenantOrgParamSchema, body: jsonBody(attachmentLinkKeysBodySchema, mockLinkAttachmentKeysBody()) },
    responses: { 200: json('Attachment with its stored file', attachmentSchema) },
  }),
  deleteAttachments: xRoute({
    method: 'delete',
    path: '/',
    xGuard: [actorGuard, tenantGuard, orgGuard],
    xRateLimiter: [bulkPointsLimiter],
    xTool: {
      description: 'Delete attachments by id. Their stored files are kept for the deleted-items period, then deleted with the rows.',
      approvalRequired: true,
      entity: 'attachment',
    },
    summary: 'Delete attachments',
    description:
      'Deletes one or more attachments by ID. Their stored files are kept for the deleted-items period, then deleted when the retention procedure removes the rows.',
    request: { params: tenantOrgParamSchema, body: jsonBody(idsWithStxBodySchema(), mockDeleteAttachmentsBody()) },
    responses: { 200: json('Success', batchResponseSchema()) },
  }),
  getPresignedUrls: xRoute({
    method: 'post',
    path: '/presigned-urls',
    xGuard: [actorGuard, tenantGuard, orgGuard],
    // A POST for its list of keys: signing download URLs needs read access only.
    xScope: 'attachment:read',
    xRateLimiter: [presignedUrlLimiter],
    summary: 'Get presigned URLs',
    description:
      'Signs download URLs for up to 50 private attachment files in one call, referenced by id + variant. Missing and denied ids come back in a uniform rejectedIds list (no 403/404 split), and the call succeeds even when every item is rejected. Public files should use the public CDN URL directly. Requires organization context.',
    request: { params: tenantOrgParamSchema, body: jsonBody(attachmentPresignedUrlsBodySchema, mockPresignedUrlsBody()) },
    responses: {
      200: json('Presigned URLs', batchResponseSchema(attachmentPresignedUrlSchema), mockPresignedUrlsResponse()),
    },
  }),
});

export { attachmentRoutes };
