import { pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from '#/utils/nanoid';
import { organizationsTable } from './organizations';
import { usersTable } from './users';

export const attachmentsTable = pgTable('attachments', {
  id: varchar().primaryKey().$defaultFn(nanoid),
  name: varchar().notNull().default('attachment'),
  filename: varchar().notNull(),
  contentType: varchar().notNull(),
  size: varchar().notNull(),
  entity: varchar({ enum: ['attachment'] })
    .notNull()
    .default('attachment'),
  url: varchar().notNull(),
  createdAt: timestamp().defaultNow().notNull(),
  createdBy: varchar().references(() => usersTable.id, {
    onDelete: 'set null',
  }),
  modifiedAt: timestamp(),
  modifiedBy: varchar().references(() => usersTable.id, {
    onDelete: 'set null',
  }),
  organizationId: varchar()
    .notNull()
    .references(() => organizationsTable.id, {
      onDelete: 'cascade',
    }),
});

export type AttachmentModel = typeof attachmentsTable.$inferSelect;
export type InsertAttachmentModel = typeof attachmentsTable.$inferInsert;
