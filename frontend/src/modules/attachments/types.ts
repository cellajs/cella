import type { z } from 'zod';
import type { InsertAttachmentModel } from '#/db/schema/attachments';
import type { attachmentSchema } from '#/modules/attachments/schema';

export type Attachment = z.infer<typeof attachmentSchema>;

export type AttachmentToInsert = InsertAttachmentModel & { type: string };
