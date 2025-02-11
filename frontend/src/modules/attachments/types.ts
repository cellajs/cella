import type { z } from 'zod';
import type { attachmentSchema } from '#/modules/attachments/schema';

export type Attachment = z.infer<typeof attachmentSchema>;
