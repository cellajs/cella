import { boolean, index, json, jsonb, snakeCase, unique, varchar } from 'drizzle-orm/pg-core';
import { appConfig, type Language, type OrganizationFlags, type OrganizationSetupConfig } from 'shared';
import type { ToolsConfig } from 'shared/tools-config';
import { channelColumns } from '#/db/utils/channel-columns';
import { maxLength } from '#/db/utils/constraints';

const languagesEnum = appConfig.languages;

/**
 * Organizations table is a primary channel entity table.
 * Each organization belongs to exactly one tenant (RLS isolation boundary).
 */
export const organizationsTable = snakeCase.table(
  'organizations',
  {
    ...channelColumns('organization'),
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
    // Per-org feature flags; keys + defaults are declared in `appConfig.defaultOrganizationFlags`.
    // Stored sparse: reads merge config defaults under the stored bag (see helpers/select), so a
    // flag added to the config later needs no backfill.
    organizationFlags: jsonb()
      .$type<OrganizationFlags>()
      .notNull()
      .default({} as OrganizationFlags),
    // Per-org setup config; app-configured defaults declared in `appConfig.defaultSetupConfig`.
    // Stored sparse like organizationFlags: reads merge config defaults under the stored bag.
    setupConfig: jsonb().$type<Partial<OrganizationSetupConfig>>().notNull().default({}),
    // Per-org tool arrangement per placement slot (order/hidden/settings, tool ids only).
    // Stored sparse: a missing slot renders manifest defaults, so new tools need no backfill.
    toolsConfig: jsonb().$type<ToolsConfig>().notNull().default({}),
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
