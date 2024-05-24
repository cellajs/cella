import { config } from 'config';
import { relations } from 'drizzle-orm';
import { boolean, index, json, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from '../../lib/nanoid';
import { membershipsTable } from './memberships';
import { usersTable } from './users';

export const organizationsTable = pgTable(
  'organizations',
  {
    id: varchar('id').primaryKey().$defaultFn(nanoid),
    entity: varchar('entity').notNull().default('ORGANIZATION'),
    name: varchar('name').notNull(),
    shortName: varchar('short_name'),
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
    websiteUrl: varchar('website_url'),
    welcomeText: varchar('welcome_text'),
    isProduction: boolean('is_production').notNull().default(false),
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
      nameIndex: index('organizations_name_index').on(table.name).desc(),
      createdAtIndex: index('organizations_created_at_index').on(table.createdAt).desc(),
    };
  },
);

export const organizationsTableRelations = relations(organizationsTable, ({ many }) => ({
  users: many(membershipsTable),
}));

export type OrganizationModel = typeof organizationsTable.$inferSelect;
export type InsertOrganizationModel = typeof organizationsTable.$inferInsert;
