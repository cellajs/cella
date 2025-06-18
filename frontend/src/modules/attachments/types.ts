import type { z } from 'zod';
import { zCreateAttachmentData, zCreateAttachmentResponse } from '~/openapi-client/zod.gen';

export type Attachment = z.infer<typeof zCreateAttachmentResponse>['data'];
export type AttachmentToInsert = z.infer<typeof zCreateAttachmentData>[number] & { type: string };
