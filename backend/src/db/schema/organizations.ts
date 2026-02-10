import { sql } from 'drizzle-orm';
import { boolean, index, json, pgPolicy, pgTable, unique, varchar } from 'drizzle-orm/pg-core';
import { appConfig, type Language } from 'shared';
import { isAuthenticated, tenantMatch, userContextSet } from '#/db/rls-helpers';
import type { AuthStrategy } from '#/db/schema/sessions';
import { contextEntityColumns } from '#/db/utils/context-entity-columns';
import { defaultRestrictions, type Restrictions } from '#/db/utils/organization-restrictions';

const languagesEnum = appConfig.languages;

/**
 * Organizations table is a primary context entity table.
 * Each organization belongs to exactly one tenant (RLS isolation boundary).
 */
export const organizationsTable = pgTable(
  'organizations',
  {
    ...contextEntityColumns('organization'),
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
    index('organizations_tenant_id_index').on(table.tenantId),
    // Compound unique for composite FK targets (memberships, products reference this)
    unique('organizations_tenant_id_unique').on(table.tenantId, table.id),
    // SELECT includes createdBy match for RETURNING after INSERT
    pgPolicy('organizations_select_policy', {
      for: 'select',
      using: sql`
        ${isAuthenticated}
        AND ${userContextSet}
        AND (
          ${table.createdBy} = current_setting('app.user_id', true)::text
          OR EXISTS (
            SELECT 1 FROM memberships m
            WHERE m.organization_id = ${table.id}
            AND m.user_id = current_setting('app.user_id', true)::text
            AND m.tenant_id = ${table.tenantId}
          )
        )
      `,
    }),
    pgPolicy('organizations_insert_policy', {
      for: 'insert',
      withCheck: sql`${tenantMatch(table)} AND ${isAuthenticated}`,
    }),
    pgPolicy('organizations_update_policy', {
      for: 'update',
      using: sql`
        ${isAuthenticated}
        AND ${userContextSet}
        AND EXISTS (
          SELECT 1 FROM memberships m
          WHERE m.organization_id = ${table.id}
          AND m.user_id = current_setting('app.user_id', true)::text
          AND m.tenant_id = ${table.tenantId}
        )
      `,
      withCheck: sql`${tenantMatch(table)} AND ${isAuthenticated}`,
    }),
    pgPolicy('organizations_delete_policy', {
      for: 'delete',
      using: sql`
        ${isAuthenticated}
        AND ${userContextSet}
        AND EXISTS (
          SELECT 1 FROM memberships m
          WHERE m.organization_id = ${table.id}
          AND m.user_id = current_setting('app.user_id', true)::text
          AND m.tenant_id = ${table.tenantId}
        )
      `,
    }),
  ],
);

export type OrganizationModel = typeof organizationsTable.$inferSelect;
export type InsertOrganizationModel = typeof organizationsTable.$inferInsert;
