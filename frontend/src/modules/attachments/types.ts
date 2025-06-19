import type { z } from 'zod/v4';
import { zCreateAttachmentData, zCreateAttachmentResponse } from '~/openapi-client/zod.gen';

export type Attachment = z.infer<typeof zCreateAttachmentResponse>['data'][number];
export type AttachmentToInsert = z.infer<typeof zCreateAttachmentData>[number] & { type: string };
