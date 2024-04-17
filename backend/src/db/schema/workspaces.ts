import { config } from 'config';
import { relations } from 'drizzle-orm';
import { boolean, index, json, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from '../../lib/nanoid';
import { usersTable } from './users';
import { membershipsTable } from './memberships';

export const workspacesTable = pgTable(
  'workspaces',
  {
    id: varchar('id').primaryKey().$defaultFn(nanoid),
    name: varchar('name').notNull().unique(),
    shortName: varchar('short_name').unique(),
    slug: varchar('slug').unique().notNull(),
    country: varchar('country'),
    timezone: varchar('timezone'),
    defaultLanguage: varchar('default_language', {
      enum: ['en', 'nl'],
    })
      .notNull()
      .default(config.defaultLanguage),
    languages: json('languages').$type<string[]>().notNull().default([config.defaultLanguage]),
    notificationEmail: varchar('notification_email'),
    emailDomains: json('email_domains').$type<string[]>(),
    brandColor: varchar('brand_color'),
    thumbnailUrl: varchar('thumbnail_url'),
    logoUrl: varchar('logo_url'),
    bannerUrl: varchar('banner_url'),
    welcomeText: varchar('welcome_text'),
    authStrategies: json('auth_strategies').$type<string[]>(),
    chatSupport: boolean('chat_support').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    createdBy: varchar('created_by').references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    modifiedAt: timestamp('modified_at'),
    modifiedBy: varchar('modified_by').references(() => usersTable.id, {
      onDelete: 'set null',
    }),
  },
  (table) => {
    return {
      nameIndex: index('workspace_name_index').on(table.name).desc(),
      createdAtIndex: index('workspace_created_at_index').on(table.createdAt).desc(),
    };
  },
);

export const workspaceTableRelations = relations(workspacesTable, ({ many }) => ({
  users: many(membershipsTable),
}));

export type WorkspaceModel = typeof workspacesTable.$inferSelect;
export type InsertWorkspaceModel = typeof workspacesTable.$inferInsert;
