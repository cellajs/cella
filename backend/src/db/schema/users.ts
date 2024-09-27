import { config } from 'config';
import { relations } from 'drizzle-orm';
import { boolean, foreignKey, index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { omitKeys } from '#/utils/omit';
import { membershipsTable } from './memberships';

const roleEnum = config.rolesByType.systemRoles;

export const usersTable = pgTable(
  'users',
  {
    id: varchar('id').primaryKey(),
    entity: varchar('entity', { enum: ['user'] })
      .notNull()
      .default('user'),
    hashedPassword: varchar('hashed_password'),
    slug: varchar('slug').unique().notNull(),
    unsubscribeToken: varchar('unsubscribe_token').unique().notNull(),
    name: varchar('name').notNull(),
    firstName: varchar('first_name'),
    lastName: varchar('last_name'),
    email: varchar('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    bio: varchar('bio'),
    language: varchar('language', {
      enum: ['en', 'nl'],
    })
      .notNull()
      .default(config.defaultLanguage),
    bannerUrl: varchar('banner_url'),
    thumbnailUrl: varchar('thumbnail_url'),
    newsletter: boolean('newsletter').notNull().default(false),
    lastSeenAt: timestamp('last_seen_at'), // last time any GET request has been made
    lastVisitAt: timestamp('last_visit_at'), // last time GET me
    lastSignInAt: timestamp('last_sign_in_at'), // last time user went through authentication flow
    createdAt: timestamp('created_at').defaultNow().notNull(),
    modifiedAt: timestamp('modified_at'),
    modifiedBy: varchar('modified_by'),
    role: varchar('role', { enum: roleEnum }).notNull().default('user'),
  },
  (table) => {
    return {
      nameIndex: index('users_name_index').on(table.name.desc()),
      unsubscribeTokenIndex: index('users_token_index').on(table.unsubscribeToken),
      emailIndex: index('users_email_index').on(table.email.desc()),
      createdAtIndex: index('users_created_at_index').on(table.createdAt.desc()),
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

export const safeUserSelect = omitKeys(usersTable, config.sensitiveFields);

export type UnsafeUserModel = typeof usersTable.$inferSelect;
export type InsertUserModel = typeof usersTable.$inferInsert;
export type UserModel = Omit<UnsafeUserModel, (typeof config.sensitiveFields)[number]>;
