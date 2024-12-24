import { config } from 'config';
import { boolean, foreignKey, index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { omitKeys } from '#/utils/omit';

const roleEnum = config.rolesByType.systemRoles;

export const usersTable = pgTable(
  'users',
  {
    id: varchar().primaryKey(),
    entity: varchar({ enum: ['user'] })
      .notNull()
      .default('user'),
    hashedPassword: varchar(),
    slug: varchar().unique().notNull(),
    unsubscribeToken: varchar().unique().notNull(),
    name: varchar().notNull(),
    firstName: varchar(),
    lastName: varchar(),
    email: varchar().notNull().unique(),
    emailVerified: boolean().notNull().default(false),
    bio: varchar(),
    language: varchar({
      enum: ['en', 'nl'],
    })
      .notNull()
      .default(config.defaultLanguage),
    bannerUrl: varchar(),
    thumbnailUrl: varchar(),
    newsletter: boolean().notNull().default(false),
    lastSeenAt: timestamp(), // last time any GET request has been made
    lastStartedAt: timestamp(), // last time GET me
    lastSignInAt: timestamp(), // last time user went through authentication flow
    createdAt: timestamp().defaultNow().notNull(),
    modifiedAt: timestamp(),
    modifiedBy: varchar(),
    role: varchar({ enum: roleEnum }).notNull().default('user'),
  },
  (table) => [
    index('users_name_index').on(table.name.desc()),
    index('users_token_index').on(table.unsubscribeToken),
    index('users_email_index').on(table.email.desc()),
    index('users_created_at_index').on(table.createdAt.desc()),
    foreignKey({
      columns: [table.modifiedBy],
      foreignColumns: [table.id],
    }),
  ],
);

export const safeUserSelect = omitKeys(usersTable, config.sensitiveFields);

const detailedFields = [
  'firstName',
  'lastName',
  'emailVerified',
  'bio',
  'language',
  'newsletter',
  'lastSeenAt',
  'lastStartedAt',
  'lastSignInAt',
  'createdAt',
  'modifiedAt',
  'modifiedBy',
  'role',
] as const;

export const baseLimitedUserSelect = omitKeys(safeUserSelect, detailedFields);

export type UnsafeUserModel = typeof usersTable.$inferSelect;
export type InsertUserModel = typeof usersTable.$inferInsert;
export type UserModel = Omit<UnsafeUserModel, (typeof config.sensitiveFields)[number]>;
export type LimitedUserModel = Omit<UserModel, (typeof detailedFields)[number]>;
