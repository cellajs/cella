import { createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
import { publicGuard } from '#/middlewares/guard';
import { presignedUrlLimiter } from '#/middlewares/rate-limiter/limiters';
import { mockPresignedUrlsBody, mockPresignedUrlsResponse } from '#/modules/attachment/attachment-mocks';
import { attachmentPresignedUrlSchema, attachmentPresignedUrlsBodySchema } from '#/modules/attachment/attachment-schema';
import { batchResponseSchema, tenantOrgParamSchema } from '#/schemas';

export const publicAttachmentRoutes = createXRoutes(['attachments', 'cella', 'product'], {
  presignPublicAttachmentUrls: xRoute({
    method: 'post',
    path: '/~presign-urls',
    xGuard: [publicGuard],
    xRateLimiter: [presignedUrlLimiter],
    summary: 'Get presigned URLs as a visitor',
    description:
      'Signs download URLs for up to 50 attachment files of the organization that a reader without a sign-in may read: rows whose public flag is set, on an entity type the app opened with publicRead(). Missing and denied ids come back in one rejectedIds list, and the call succeeds even when every item is rejected; an app without public read on attachments rejects every id.',
    request: { params: tenantOrgParamSchema, body: jsonBody(attachmentPresignedUrlsBodySchema, mockPresignedUrlsBody()) },
    responses: { 200: json('Presigned URLs', batchResponseSchema(attachmentPresignedUrlSchema), mockPresignedUrlsResponse()) },
  }),
});
