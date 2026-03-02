import { pgTable, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from 'shared/nanoid';
import { usersTable } from '#/db/schema/users';
import { maxLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';

export const passkeysTable = pgTable('passkeys', {
  id: varchar({ length: maxLength.id }).primaryKey().$defaultFn(nanoid),
  userId: varchar({ length: maxLength.id })
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  credentialId: varchar({ length: maxLength.url }).notNull(),
  publicKey: varchar({ length: maxLength.url }).notNull(),
  deviceName: varchar({ length: maxLength.field }),
  deviceType: varchar({ enum: ['desktop', 'mobile'] })
    .notNull()
    .default('desktop'),
  deviceOs: varchar({ length: maxLength.field }),
  browser: varchar({ length: maxLength.field }),
  nameOnDevice: varchar({ length: maxLength.field }).notNull(),
  createdAt: timestampColumns.createdAt,
});

export type PasskeyModel = typeof passkeysTable.$inferSelect;
export type InsertPasskeyModel = typeof passkeysTable.$inferInsert;
