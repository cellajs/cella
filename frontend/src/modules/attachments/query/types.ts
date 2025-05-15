import type { Attachment } from '~/modules/attachments/types';
import type { ContextQueryProp, InfiniteQueryData, QueryData } from '~/query/types';

export type AttachmentQueryData = QueryData<Attachment>;
export type AttachmentInfiniteQueryData = InfiniteQueryData<Attachment>;
export type AttachmentContextProp = ContextQueryProp<Attachment, string[] | null>;
