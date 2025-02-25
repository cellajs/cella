import { type Language, config } from 'config';
import { boolean, index, json, pgTable, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { nanoid } from '#/utils/nanoid';
import { timestampsColumn } from '../utils/timestamp-columns';

const languagesEnum = config.languages;

export const organizationsTable = pgTable(
  'organizations',
  {
    id: varchar().primaryKey().$defaultFn(nanoid),
    entity: varchar({ enum: ['organization'] })
      .notNull()
      .default('organization'),
    name: varchar().notNull(),
    shortName: varchar(),
    slug: varchar().unique().notNull(),
    country: varchar(),
    timezone: varchar(),
    defaultLanguage: varchar({ enum: languagesEnum }).notNull().default(config.defaultLanguage),
    languages: json().$type<Language[]>().notNull().default([config.defaultLanguage]),
    notificationEmail: varchar(),
    emailDomains: json().$type<string[]>().notNull().default([]),
    color: varchar(),
    thumbnailUrl: varchar(),
    bannerUrl: varchar(),
    logoUrl: varchar(),
    websiteUrl: varchar(),
    welcomeText: varchar(),
    authStrategies: json().$type<string[]>().notNull().default([]),
    chatSupport: boolean().notNull().default(false),
    createdAt: timestampsColumn.createdAt,
    createdBy: varchar().references(() => usersTable.id, { onDelete: 'set null' }),
    modifiedAt: timestampsColumn.modifiedAt,
    modifiedBy: varchar().references(() => usersTable.id, { onDelete: 'set null' }),
  },
  (table) => [index('organizations_name_index').on(table.name.desc()), index('organizations_created_at_index').on(table.createdAt.desc())],
);

export type OrganizationModel = typeof organizationsTable.$inferSelect;
export type InsertOrganizationModel = typeof organizationsTable.$inferInsert;
