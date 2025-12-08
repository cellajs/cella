import type z from 'zod';
import type { Attachment, CreateAttachmentData, DeleteAttachmentsData, UpdateAttachmentData } from '~/api.gen';
import type { ContextQueryProp, InfiniteQueryData, QueryData } from '~/query/types';
import type { attachmentsRouteSearchParamsSchema } from '~/routes/search-params-schemas';

export type AttachmentsRouteSearchParams = z.infer<typeof attachmentsRouteSearchParamsSchema>;

export type AttachmentQueryData = QueryData<Attachment>;
export type AttachmentInfiniteQueryData = InfiniteQueryData<Attachment>;
export type AttachmentContextProp = ContextQueryProp<Attachment, string[] | null>;

export type CreateAttachmentParams = { localCreation: boolean; attachments: CreateAttachmentData['body'] } & CreateAttachmentData['path'];
export type UpdateAttachmentParams = UpdateAttachmentData['body'] & UpdateAttachmentData['path'] & { localUpdate: boolean };
export type DeleteAttachmentsParams = { localDeletionIds: string[]; serverDeletionIds: string[] } & DeleteAttachmentsData['path'];
