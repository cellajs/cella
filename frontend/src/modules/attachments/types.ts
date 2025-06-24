import type { z } from 'zod/v4';
import { zCreateAttachmentData, zCreateAttachmentResponse } from '~/openapi-client/zod.gen';
import type { ContextQueryProp, InfiniteQueryData, QueryData } from '~/query/types';

export type Attachment = z.infer<typeof zCreateAttachmentResponse>['data'][number];
export type AttachmentToInsert = z.infer<typeof zCreateAttachmentData>['body'][number] & { type: string };

export type AttachmentQueryData = QueryData<Attachment>;
export type AttachmentInfiniteQueryData = InfiniteQueryData<Attachment>;
export type AttachmentContextProp = ContextQueryProp<Attachment, string[] | null>;
