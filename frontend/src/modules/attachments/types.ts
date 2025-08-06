import type { z } from 'zod';
import type { CreateAttachmentData, DeleteAttachmentsData, UpdateAttachmentData } from '~/api.gen';
import type { zAttachmentTableSchema, zCreateAttachmentData, zCreateAttachmentResponse } from '~/api.gen/zod.gen';
import type { ContextQueryProp, InfiniteQueryData, QueryData } from '~/query/types';
import type { CamelToSnakeObject } from '~/utils/electric-utils';

export type Attachment = z.infer<typeof zCreateAttachmentResponse>[number];
export type LiveQueryAttachment = CamelToSnakeObject<z.infer<typeof zAttachmentTableSchema>>;

export type AttachmentToInsert = z.infer<typeof zCreateAttachmentData>['body'][number] & { type: string };

export type AttachmentQueryData = QueryData<Attachment>;
export type AttachmentInfiniteQueryData = InfiniteQueryData<Attachment>;
export type AttachmentContextProp = ContextQueryProp<Attachment, string[] | null>;

export type CreateAttachmentParams = { localCreation: boolean; attachments: CreateAttachmentData['body'] } & CreateAttachmentData['path'];
export type UpdateAttachmentParams = UpdateAttachmentData['body'] & UpdateAttachmentData['path'];
export type DeleteAttachmentsParams = { localDeletionIds: string[]; serverDeletionIds: string[] } & DeleteAttachmentsData['path'];
