import { boolean, index, json, pgTable, varchar } from 'drizzle-orm/pg-core';
import { appConfig, type Language } from 'shared';
import type { AuthStrategy } from '#/db/schema/sessions';
import { contextEntityColumns } from '#/db/utils/context-entity-columns';
import { defaultRestrictions, type Restrictions } from '#/db/utils/organization-restrictions';

const languagesEnum = appConfig.languages;

/**
 * Organizations table is a primary context entity table.
 */
export const organizationsTable = pgTable(
  'organizations',
  {
    ...contextEntityColumns('organization'),
    // Specific columns
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
  },
  (table) => [
    index('organizations_name_index').on(table.name.desc()),
    index('organizations_created_at_index').on(table.createdAt.desc()),
  ],
);

export type OrganizationModel = typeof organizationsTable.$inferSelect;
export type InsertOrganizationModel = typeof organizationsTable.$inferInsert;
