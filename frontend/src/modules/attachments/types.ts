import type { z } from 'zod';
import type { zAttachmentTableSchema, zCreateAttachmentData, zCreateAttachmentResponse } from '~/api.gen/zod.gen';
import type { CamelToSnakeObject } from '~/utils/electric-utils';

export type Attachment = z.infer<typeof zCreateAttachmentResponse>[number];
export type LiveQueryAttachment = CamelToSnakeObject<z.infer<typeof zAttachmentTableSchema>>;
export type AttachmentToInsert = z.infer<typeof zCreateAttachmentData>['body'][number] & { type: string };
