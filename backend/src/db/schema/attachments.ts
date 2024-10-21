import { pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from '#/utils/nanoid';
import { organizationsTable } from './organizations';
import { projectsTable } from './projects';
import { usersTable } from './users';

export const attachmentsTable = pgTable('attachments', {
  id: varchar('id').primaryKey().$defaultFn(nanoid),
  filename: varchar('filename').notNull(),
  contentType: varchar('content_type').notNull(),
  size: varchar('size').notNull(),
  entity: varchar('entity', { enum: ['attachment'] })
    .notNull()
    .default('attachment'),
  url: varchar('url').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdBy: varchar('created_by').references(() => usersTable.id, {
    onDelete: 'set null',
  }),
  modifiedAt: timestamp('modified_at'),
  modifiedBy: varchar('modified_by').references(() => usersTable.id, {
    onDelete: 'set null',
  }),
  organizationId: varchar('organization_id')
    .notNull()
    .references(() => organizationsTable.id, {
      onDelete: 'cascade',
    }),
<<<<<<< HEAD
  projectId: varchar('project_id')
    .notNull()
    .references(() => projectsTable.id, {
      onDelete: 'cascade',
    }),
  taskId: varchar('task_id')
    .notNull()
    .references(() => tasksTable.id, {
      onDelete: 'cascade',
    }),
=======
>>>>>>> upstream/development
});

export type AttachmentModel = typeof attachmentsTable.$inferSelect;
export type InsertAttachmentModel = typeof attachmentsTable.$inferInsert;
