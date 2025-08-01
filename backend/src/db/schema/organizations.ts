import { appConfig, type Language } from 'config';
import { boolean, index, json, pgTable, varchar } from 'drizzle-orm/pg-core';
import type { AuthStrategy } from '#/db/schema/sessions';
import { usersTable } from '#/db/schema/users';
import { defaultRestrictions, type Restrictions } from '#/db/utils/organization-restrictions';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

const languagesEnum = appConfig.languages;

export const organizationsTable = pgTable(
  'organizations',
  {
    createdAt: timestampColumns.createdAt,
    id: varchar().primaryKey().$defaultFn(nanoid),
    entityType: varchar({ enum: ['organization'] })
      .notNull()
      .default('organization'),
    name: varchar().notNull(),
    description: varchar(),
    slug: varchar().unique().notNull(),
    thumbnailUrl: varchar(),
    bannerUrl: varchar(),
    shortName: varchar(),
    country: varchar(),
    timezone: varchar(),
    defaultLanguage: varchar({ enum: languagesEnum }).notNull().default(appConfig.defaultLanguage),
    languages: json().$type<Language[]>().notNull().default([appConfig.defaultLanguage]),
    restrictions: json().$type<Restrictions>().notNull().default(defaultRestrictions()),
    notificationEmail: varchar(),
    emailDomains: json().$type<string[]>().notNull().default([]),
    color: varchar(),
    logoUrl: varchar(),
    websiteUrl: varchar(),
    welcomeText: varchar(),
    authStrategies: json().$type<AuthStrategy[]>().notNull().default([]),
    chatSupport: boolean().notNull().default(false),
    createdBy: varchar().references(() => usersTable.id, { onDelete: 'set null' }),
    modifiedAt: timestampColumns.modifiedAt,
    modifiedBy: varchar().references(() => usersTable.id, { onDelete: 'set null' }),
  },
  (table) => [index('organizations_name_index').on(table.name.desc()), index('organizations_created_at_index').on(table.createdAt.desc())],
);

export type OrganizationModel = typeof organizationsTable.$inferSelect;
export type InsertOrganizationModel = typeof organizationsTable.$inferInsert;
