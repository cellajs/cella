import { boolean, index, json, snakeCase, unique, varchar } from 'drizzle-orm/pg-core';
import { appConfig, type Language } from 'shared';
import { channelEntityColumns } from '#/db/utils/channel-entity-columns';
import { maxLength } from '#/db/utils/constraints';
import type { AuthStrategy } from '#/modules/auth/sessions-db';

const languagesEnum = appConfig.languages;

/**
 * Organizations table is a primary context entity table.
 * Each organization belongs to exactly one tenant (RLS isolation boundary).
 */
export const organizationsTable = snakeCase.table(
  'organizations',
  {
    ...channelEntityColumns('organization'),
    shortName: varchar({ length: maxLength.field }),
    country: varchar({ length: maxLength.field }),
    timezone: varchar({ length: maxLength.field }),
    defaultLanguage: varchar({ enum: languagesEnum }).notNull().default(appConfig.defaultLanguage),
    languages: json().$type<Language[]>().notNull().default([appConfig.defaultLanguage]),
    notificationEmail: varchar({ length: maxLength.field }),
    color: varchar({ length: maxLength.field }),
    logoUrl: varchar({ length: maxLength.url }),
    websiteUrl: varchar({ length: maxLength.url }),
    welcomeText: varchar({ length: maxLength.html }),
    authStrategies: json().$type<AuthStrategy[]>().notNull().default([]),
    chatSupport: boolean().notNull().default(false),
  },
  (table) => [
    index('organizations_name_index').on(table.name.desc()),
    index('organizations_created_at_index').on(table.createdAt.desc()),
    index('organizations_tenant_id_index').on(table.tenantId),
    index('organizations_created_by_index').on(table.createdBy),
    index('organizations_updated_by_index').on(table.updatedBy),
    // Compound unique for composite FK targets (memberships, products reference this)
    unique('organizations_tenant_id_unique').on(table.tenantId, table.id),
  ],
);

export type OrganizationModel = typeof organizationsTable.$inferSelect;
export type InsertOrganizationModel = typeof organizationsTable.$inferInsert;
