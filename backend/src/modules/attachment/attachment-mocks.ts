import { faker } from '@faker-js/faker';
import { appConfig } from 'shared';
import { hashSourceId } from 'shared/utils/hash-source-id';
import {
  generateMockEntityChannelIdColumns,
  mockBatchResponse,
  mockNanoid,
  mockPaginated,
  mockProductColumns,
  mockStx,
  withFakerSeed,
} from '#/mocks';
import type { AttachmentModel } from '#/modules/attachment/attachment-db';
import { mockActorRefs } from '#/schemas/entity-base-mocks';

/** Deterministic: the same key produces the same data. */
export const mockAttachment = (key = 'attachment:default'): AttachmentModel =>
  withFakerSeed(key, () => {
    const filename = faker.system.fileName();
    const channelIds = generateMockEntityChannelIdColumns('attachment');

    return {
      ...mockProductColumns('attachment', { name: filename, description: null }),
      publicBucket: false,
      bucketName: 'attachments',
      groupId: null,
      filename,
      contentType: faker.system.mimeType(),
      convertedContentType: null,
      size: String(faker.number.int({ min: 1000, max: 10_000_000 })),
      keys: { original: `uploads/${mockNanoid()}/${filename}` },
      purgedAt: null,
      ...channelIds,
    };
  });

/** Attachment wire response with its writer ids resolved to actor references. */
export const mockAttachmentResponse = (key = 'attachment:default') => {
  const { purgedAt: _purgedAt, ...attachment } = mockAttachment(key);
  return { ...attachment, ...mockActorRefs(attachment, key), deletedBy: null };
};

export const mockPaginatedAttachmentsResponse = (count = 2) => mockPaginated(mockAttachmentResponse, count);

export const mockBatchAttachmentsResponse = (count = 2) => mockBatchResponse(mockAttachmentResponse, count);

/** One signed download URL as `getPresignedUrls` returns it. The signature is truncated, and the ungenerated variant resolves to the original key. */
const mockPresignedUrlItem = (key = 'attachment:default') => {
  const attachment = mockAttachment(key);
  return {
    attachmentId: attachment.id,
    variant: 'thumbnail',
    url: `https://${attachment.bucketName}.${appConfig.s3.host}/${attachment.keys.original}?X-Amz-Signature=…`,
  };
};

export const mockPresignedUrlsResponse = (count = 2) => mockBatchResponse(mockPresignedUrlItem, count);

// Request bodies of the routes an API key or access token can call, built from the attachment mock so ids agree.

export const mockCreateAttachmentsBody = () =>
  withFakerSeed('attachment:create-body', () => {
    const { id, name, filename, contentType, size, keys } = mockAttachment();
    return [{ id, name, filename, contentType, size, keys, stx: mockStx() }];
  });

/** Each changed field carries its HLC timestamp, `millis:counter:sourceHash`. */
export const mockUpdateAttachmentBody = () =>
  withFakerSeed('attachment:update-body', () => {
    const stx = mockStx();
    const fieldTimestamps = { name: `1735732800000:0001:${hashSourceId(stx.sourceId)}` };
    return { ops: { name: `${mockAttachment().name} (final)` }, stx: { ...stx, fieldTimestamps } };
  });

export const mockDeleteAttachmentsBody = () =>
  withFakerSeed('attachment:delete-body', () => {
    const { mutationId, sourceId } = mockStx();
    return { ids: [mockAttachment().id], stx: { mutationId, sourceId } };
  });

export const mockPresignedUrlsBody = () => ({ items: [{ attachmentId: mockAttachment().id, variant: 'thumbnail' as const }] });

export const mockLinkAttachmentKeysBody = () => {
  const { keys } = mockAttachment();
  return { keys: { ...keys, thumbnail: `${keys.original}.thumbnail.webp` }, convertedContentType: null };
};
