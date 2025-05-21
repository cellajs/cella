import { config } from 'config';
import { boolean, foreignKey, index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from '#/utils/nanoid';
import { timestampColumns } from '../utils/timestamp-columns';

const roleEnum = config.rolesByType.systemRoles;
const languagesEnum = config.languages;

/**
 * Users table contains all users. It is used to store user information such as name, email, password, etc.
 * Its closely related to `emailsTable`, which stores email addresses and email verification.
 *
 * @link http://localhost:4000/docs#tag/users
 */
export const usersTable = pgTable(
  'users',
  {
    id: varchar().primaryKey().$defaultFn(nanoid),
    entity: varchar({ enum: ['user'] })
      .notNull()
      .default('user'),
    name: varchar().notNull(),
    description: varchar(),
    slug: varchar().unique().notNull(),
    thumbnailUrl: varchar(),
    bannerUrl: varchar(),

    email: varchar().notNull().unique(),
    hashedPassword: varchar(),
    unsubscribeToken: varchar().unique().notNull(),
    firstName: varchar(),
    lastName: varchar(),
    language: varchar({ enum: languagesEnum }).notNull().default(config.defaultLanguage),
    newsletter: boolean().notNull().default(false),
    role: varchar({ enum: roleEnum }).notNull().default('user'),
    createdAt: timestampColumns.createdAt,
    modifiedAt: timestampColumns.modifiedAt,
    lastSeenAt: timestamp({ mode: 'string' }), // last time a GET request has been made in last 5 minutes
    lastStartedAt: timestamp({ mode: 'string' }), // last time GET me
    lastSignInAt: timestamp({ mode: 'string' }), // last time user went through authentication flow
    modifiedBy: varchar(),
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

export type UnsafeUserModel = typeof usersTable.$inferSelect;
export type InsertUserModel = typeof usersTable.$inferInsert;
export type UserModel = Omit<UnsafeUserModel, (typeof config.sensitiveFields)[number]>;
