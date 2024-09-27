import { pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from '#/utils/nanoid';
import { tasksTable } from './tasks';
import { usersTable } from './users';

export const attachmentsTable = pgTable('attachments', {
  id: varchar('id').primaryKey().$defaultFn(nanoid),
  filename: varchar('filename').notNull(),
  contentType: varchar('content_type').notNull(),
  size: varchar('size').notNull(),
  taskId: varchar('task_id')
    .notNull()
    .references(() => tasksTable.id, {
      onDelete: 'cascade',
    }),
  url: varchar('url').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdBy: varchar('created_by').references(() => usersTable.id, {
    onDelete: 'set null',
  }),
});

export type AttachmentModel = typeof attachmentsTable.$inferSelect;
export type InsertAttachmentModel = typeof attachmentsTable.$inferInsert;
