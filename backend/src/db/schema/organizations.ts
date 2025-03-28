import { type Entity, type Language, config } from 'config';
import { boolean, index, json, pgTable, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { timestampsColumn } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

const languagesEnum = config.languages;

// To avoid error on schema return and not set default undefined for all entities
type Restrictions = {
  [K in Exclude<Entity, 'organization'>]: number | undefined;
} & Partial<Record<Exclude<Entity, 'organization'>, number>>;

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
    /**
     * Restrictions config for the organization.
     * Used to control limits on certain entities or behaviors under this organization.
     * For example:
     * - Limit number of projects, tasks, or members
     * - Limit number of active online members at the same time
     *
     * The key is the entity name and the value is the numeric limit.
     */
    restrictions: json().$type<Restrictions>(),
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
