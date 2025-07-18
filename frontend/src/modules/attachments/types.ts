import type { z } from 'zod';

import type { CreateAttachmentData, DeleteAttachmentsData, UpdateAttachmentData } from '~/api.gen';
import type { zCreateAttachmentData, zCreateAttachmentResponse } from '~/api.gen/zod.gen';
import type { ContextQueryProp, InfiniteQueryData, QueryData } from '~/query/types';

export type Attachment = z.infer<typeof zCreateAttachmentResponse>[number];
export type AttachmentToInsert = z.infer<typeof zCreateAttachmentData>['body'][number] & { type: string };

export type AttachmentQueryData = QueryData<Attachment>;
export type AttachmentInfiniteQueryData = InfiniteQueryData<Attachment>;
export type AttachmentContextProp = ContextQueryProp<Attachment, string[] | null>;

export type CreateAttachmentParams = { attachments: CreateAttachmentData['body'] } & CreateAttachmentData['path'];
export type UpdateAttachmentParams = NonNullable<UpdateAttachmentData['body']> & UpdateAttachmentData['path'];
export type DeleteAttachmentsParams = DeleteAttachmentsData['body'] & DeleteAttachmentsData['path'];
