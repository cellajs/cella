import { config } from 'config';
import { boolean, index, json, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { nanoid } from '#/utils/nanoid';

type Language = (typeof config.languages)[number]['value'];

const languages = config.languages.map((lang) => lang.value) as [string, ...string[]];

export const organizationsTable = pgTable(
  'organizations',
  {
    id: varchar('id').primaryKey().$defaultFn(nanoid),
    entity: varchar('entity', { enum: ['organization'] })
      .notNull()
      .default('organization'),
    name: varchar('name').notNull(),
    shortName: varchar('short_name'),
    slug: varchar('slug').unique().notNull(),
    country: varchar('country'),
    timezone: varchar('timezone'),
    defaultLanguage: varchar('default_language', { enum: languages }).notNull().default(config.defaultLanguage),
    languages: json('languages').$type<Language[]>().notNull().default([config.defaultLanguage]),
    notificationEmail: varchar('notification_email'),
    emailDomains: json('email_domains').$type<string[]>().notNull().default([]),
    color: varchar('color'),
    thumbnailUrl: varchar('thumbnail_url'),
    bannerUrl: varchar('banner_url'),
    logoUrl: varchar('logo_url'),
    websiteUrl: varchar('website_url'),
    welcomeText: varchar('welcome_text'),
    authStrategies: json('auth_strategies').$type<string[]>().notNull().default([]),
    chatSupport: boolean('chat_support').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    createdBy: varchar('created_by').references(() => usersTable.id, { onDelete: 'set null' }),
    modifiedAt: timestamp('modified_at'),
    modifiedBy: varchar('modified_by').references(() => usersTable.id, { onDelete: 'set null' }),
  },
  (table) => {
    return {
      nameIndex: index('organizations_name_index').on(table.name.desc()),
      createdAtIndex: index('organizations_created_at_index').on(table.createdAt.desc()),
    };
  },
);

export type OrganizationModel = typeof organizationsTable.$inferSelect;
export type InsertOrganizationModel = typeof organizationsTable.$inferInsert;
