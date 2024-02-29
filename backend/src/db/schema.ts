import { relations } from 'drizzle-orm';
import { boolean, foreignKey, index, json, pgTable, primaryKey, timestamp, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from '../lib/nanoid';

export const usersTable = pgTable(
  'users',
  {
    id: varchar('id').primaryKey(),
    hashedPassword: varchar('hashed_password'),
    slug: varchar('slug').unique().notNull(),
    name: varchar('name'),
    firstName: varchar('first_name'),
    lastName: varchar('last_name'),
    email: varchar('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    bio: varchar('bio'),
    language: varchar('language').notNull(),
    bannerUrl: varchar('banner_url'),
    thumbnailUrl: varchar('thumbnail_url'),
    newsletter: boolean('newsletter').notNull().default(false),
    clearSessionsAt: timestamp('clear_sessions_at'), // all sessions should be treated as expired if set before this date
    lastEmailAt: timestamp('last_email_at'), // last time an email notification was successfully sent
    lastSeenAt: timestamp('last_seen_at'), // last time any GET request has been made
    lastVisitAt: timestamp('last_visit_at'), // last time GET me
    lastSignInAt: timestamp('last_sign_in_at'), // last time user went through authentication flow
    createdAt: timestamp('created_at').defaultNow().notNull(),
    modifiedAt: timestamp('modified_at'),
    modifiedBy: varchar('modified_by'),
    role: varchar('role', { enum: ['USER', 'ADMIN'] })
      .notNull()
      .default('USER'),
  },
  (table) => {
    return {
      nameIndex: index('users_name_index').on(table.name).desc(),
      emailIndex: index('users_email_index').on(table.email).desc(),
      createdAtIndex: index('users_created_at_index').on(table.createdAt).desc(),
      modifiedByReference: foreignKey({
        columns: [table.modifiedBy],
        foreignColumns: [table.id],
      }),
    };
  },
);

export const usersTableRelations = relations(usersTable, ({ many }) => ({
  organizations: many(membershipsTable),
}));

export type UserModel = typeof usersTable.$inferSelect;
export type InsertUserModel = typeof usersTable.$inferInsert;

export const oauthAccountsTable = pgTable(
  'oauth_accounts',
  {
    providerId: varchar('provider_id', {
      enum: ['GITHUB', 'GOOGLE', 'MICROSOFT'],
    }).notNull(),
    providerUserId: varchar('provider_user_id').notNull(),
    userId: varchar('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({
        columns: [table.providerId, table.providerUserId],
      }),
    };
  },
);

export const sessionsTable = pgTable('sessions', {
  id: varchar('id').primaryKey(),
  userId: varchar('user_id')
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
});

export const tokensTable = pgTable('tokens', {
  id: varchar('id').primaryKey(),
  type: varchar('type', {
    enum: ['EMAIL_VERIFICATION', 'PASSWORD_RESET', 'INVITATION'],
  }).notNull(),
  email: varchar('email'),
  userId: varchar('user_id').references(() => usersTable.id, { onDelete: 'cascade' }),
  organizationId: varchar('organization_id').references(() => organizationsTable.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
});

export const organizationsTable = pgTable(
  'organizations',
  {
    id: varchar('id').primaryKey().$defaultFn(nanoid),
    name: varchar('name').notNull().unique(),
    shortName: varchar('short_name').unique(),
    slug: varchar('slug').unique().notNull(),
    country: varchar('country'),
    timezone: varchar('timezone'),
    defaultLanguage: varchar('default_language'),
    languages: json('languages').$type<string[]>(),
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
    createdBy: varchar('created_by').references(() => usersTable.id),
    modifiedAt: timestamp('modified_at'),
    modifiedBy: varchar('modified_by').references(() => usersTable.id),
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

export const membershipsTable = pgTable(
  'memberships',
  {
    organizationId: varchar('organization_id')
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    userId: varchar('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    role: varchar('role', { enum: ['ADMIN', 'MEMBER'] })
      .notNull()
      .default('MEMBER'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    createdBy: varchar('created_by').references(() => usersTable.id),
    modifiedAt: timestamp('modified_at'),
    modifiedBy: varchar('modified_by').references(() => usersTable.id),
  },
  (table) => {
    return {
      pk: primaryKey({
        columns: [table.organizationId, table.userId],
      }),
    };
  },
);

export const membershipsTableRelations = relations(membershipsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [membershipsTable.userId],
    references: [usersTable.id],
  }),
  organization: one(organizationsTable, {
    fields: [membershipsTable.organizationId],
    references: [organizationsTable.id],
  }),
}));

export type MembershipModel = typeof membershipsTable.$inferSelect;
export type InsertMembershipModel = typeof membershipsTable.$inferInsert;
