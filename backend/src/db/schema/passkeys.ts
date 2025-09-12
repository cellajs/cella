import { pgTable, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

export const passkeysTable = pgTable('passkeys', {
  id: varchar().primaryKey().$defaultFn(nanoid),
  userId: varchar()
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  credentialId: varchar().notNull(),
  publicKey: varchar().notNull(),
  deviceName: varchar(),
  deviceType: varchar({ enum: ['desktop', 'mobile'] })
    .notNull()
    .default('desktop'),
  deviceOs: varchar(),
  browser: varchar(),
  nameOnDevice: varchar().notNull(),
  createdAt: timestampColumns.createdAt,
});
