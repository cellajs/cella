import type { Attachment } from '~/modules/attachments/types';
import type { ContextProp, InfiniteQueryData, QueryData } from '~/query/types';

export type AttachmentQueryData = QueryData<Attachment>;
export type AttachmentInfiniteQueryData = InfiniteQueryData<Attachment>;
export type AttachmentContextProp = ContextProp<Attachment, string[] | null>;
