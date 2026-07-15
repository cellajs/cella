import { boolean, index, json, snakeCase, unique, varchar } from 'drizzle-orm/pg-core';
import { appConfig, type Language } from 'shared';
import { channelEntityColumns } from '#/db/utils/channel-entity-columns';
import { maxLength } from '#/db/utils/constraints';

const languagesEnum = appConfig.languages;

/**
 * Organizations table is a primary channel entity table.
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
    chatSupport: boolean().notNull().default(false),
  },
  (table) => [
    index('organizations_name_index').on(table.name.desc()),
    index('organizations_created_at_index').on(table.createdAt.desc()),
    // 1 tenant = 1 organization: a tenant holds at most one org. This unique constraint is the
    // hard backstop for the guard in create-organizations; it also serves tenant_id lookups (so the
    // former non-unique organizations_tenant_id_index is dropped as redundant).
    unique('organizations_tenant_id_key').on(table.tenantId),
    index('organizations_created_by_index').on(table.createdBy),
    index('organizations_updated_by_index').on(table.updatedBy),
    // Compound unique for composite FK targets (memberships, products reference this)
    unique('organizations_tenant_id_unique').on(table.tenantId, table.id),
  ],
);

export type OrganizationModel = typeof organizationsTable.$inferSelect;
export type InsertOrganizationModel = typeof organizationsTable.$inferInsert;
