import { bigint, snakeCase, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId } from 'shared/utils/entity-id';
import { maxLength } from '#/db/utils/constraints';
import type { UserId } from '#/db/utils/ids';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { usersTable } from '#/modules/user/user-db';

export const totpsTable = snakeCase.table(
  'totps',
  {
    id: uuid().primaryKey().$defaultFn(generateId),
    userId: uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' })
      .$type<UserId>(),
    secret: varchar({ length: maxLength.field }).notNull(),
    /** The time step of the newest code that verified. A code verifies only for a later step, so each counts once. */
    lastUsedStep: bigint({ mode: 'number' }),
    createdAt: timestampColumns.createdAt,
  },
  // One authenticator app per account: of two setups confirmed at once, the second finds the first's row.
  (table) => [uniqueIndex('totps_user_id_idx').on(table.userId)],
);
