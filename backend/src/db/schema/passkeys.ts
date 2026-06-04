import { index, snakeCase, uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId } from 'shared/entity-id';
import { usersTable } from '#/db/schema/users';
import { maxLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';

export const passkeysTable = snakeCase.table(
  'passkeys',
  {
    id: uuid().primaryKey().$defaultFn(generateId),
    userId: uuid()
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
  },
  (table) => [
    index('passkeys_user_id_idx').on(table.userId),
    index('passkeys_credential_id_idx').on(table.credentialId),
  ],
);

export type PasskeyModel = typeof passkeysTable.$inferSelect;
export type InsertPasskeyModel = typeof passkeysTable.$inferInsert;
