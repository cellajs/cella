import { boolean, foreignKey, index, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { appConfig, type UserFlags } from 'shared';
import { maxLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

const languagesEnum = appConfig.languages;

/** Users table. Closely related to `emailsTable` for email verification. */
export const usersTable = pgTable(
  'users',
  {
    createdAt: timestampColumns.createdAt,
    id: varchar({ length: maxLength.id }).primaryKey().$defaultFn(nanoid),
    entityType: varchar({ enum: ['user'] })
      .notNull()
      .default('user'),
    name: varchar({ length: maxLength.field }).notNull(),
    description: text(),
    slug: varchar({ length: maxLength.field }).unique().notNull(),
    thumbnailUrl: varchar({ length: maxLength.url }),
    bannerUrl: varchar({ length: maxLength.url }),
    email: varchar({ length: maxLength.field }).notNull().unique(),
    mfaRequired: boolean().notNull().default(false),
    firstName: varchar({ length: maxLength.field }),
    lastName: varchar({ length: maxLength.field }),
    language: varchar({ enum: languagesEnum }).notNull().default(appConfig.defaultLanguage),
    newsletter: boolean().notNull().default(false),
    userFlags: jsonb()
      .$type<UserFlags>()
      .notNull()
      .default({} as UserFlags),
    modifiedAt: timestampColumns.modifiedAt,
    lastStartedAt: timestamp({ mode: 'string' }), // Last time GET /me was called
    lastSignInAt: timestamp({ mode: 'string' }), // Last time user completed authentication flow
    modifiedBy: varchar({ length: maxLength.id }),
  },
  (table) => [
    index('users_name_index').on(table.name.desc()),
    index('users_email_index').on(table.email.desc()),
    index('users_created_at_index').on(table.createdAt.desc()),
    foreignKey({
      columns: [table.modifiedBy],
      foreignColumns: [table.id],
    }),
  ],
);

export type UserModel = typeof usersTable.$inferSelect;
export type InsertUserModel = typeof usersTable.$inferInsert;
