import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { attachmentsTable } from '../../db/schema/attachments';

export const createAttachmentSchema = createInsertSchema(attachmentsTable);

export const attachmentSchema = createSelectSchema(attachmentsTable);
