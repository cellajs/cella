import { config } from 'config';
import { boolean, foreignKey, index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from '#/utils/nanoid';
import { timestampsColumn } from '../utils';

const roleEnum = config.rolesByType.systemRoles;
const languagesEnum = config.languages;

export const usersTable = pgTable(
  'users',
  {
    id: varchar().primaryKey().$defaultFn(nanoid),
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
    language: varchar({ enum: languagesEnum }).notNull().default(config.defaultLanguage),
    bannerUrl: varchar(),
    thumbnailUrl: varchar(),
    newsletter: boolean().notNull().default(false),
    lastSeenAt: timestamp({ mode: 'string' }), // last time a GET request has been made in last 5 minutes
    lastStartedAt: timestamp({ mode: 'string' }), // last time GET me
    lastSignInAt: timestamp({ mode: 'string' }), // last time user went through authentication flow
    createdAt: timestampsColumn.createdAt,
    modifiedAt: timestampsColumn.modifiedAt,
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

export type UnsafeUserModel = typeof usersTable.$inferSelect;
export type InsertUserModel = typeof usersTable.$inferInsert;
export type UserModel = Omit<UnsafeUserModel, (typeof config.sensitiveFields)[number]>;
