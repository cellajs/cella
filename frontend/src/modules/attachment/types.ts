import type z from 'zod';
import type { Attachment, CreateAttachmentsData, DeleteAttachmentsData, UpdateAttachmentData } from '~/api.gen';
import type { attachmentsRouteSearchParamsSchema } from '~/modules/attachment/search-params-schemas';
import type { ContextQueryProp, InfiniteQueryData, QueryData } from '~/query/types';

export type AttachmentsRouteSearchParams = z.infer<typeof attachmentsRouteSearchParamsSchema>;

export type AttachmentQueryData = QueryData<Attachment>;
export type AttachmentInfiniteQueryData = InfiniteQueryData<Attachment>;
export type AttachmentContextProp = ContextQueryProp<Attachment, string[] | null>;

export type CreateAttachmentParams = {
  localCreation: boolean;
  attachments: CreateAttachmentsData['body'];
} & CreateAttachmentsData['path'];

export type UpdateAttachmentParams = UpdateAttachmentData['body'] &
  UpdateAttachmentData['path'] & { localUpdate: boolean };

export type DeleteAttachmentsParams = {
  localDeletionIds: string[];
  serverDeletionIds: string[];
} & DeleteAttachmentsData['path'];
