import { bigint, boolean, index, snakeCase, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId } from 'shared/utils/entity-id';
import { maxLength } from '#/db/utils/constraints';
import type { UserId } from '#/db/utils/ids';
import { isoTimestamp, timestampColumns } from '#/db/utils/timestamp-columns';
import { usersTable } from '#/modules/user/user-db';

export const passkeysTable = snakeCase.table(
  'passkeys',
  {
    id: uuid().primaryKey().$defaultFn(generateId),
    userId: uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' })
      .$type<UserId>(),
    credentialId: varchar({ length: maxLength.url }).notNull(),
    publicKey: varchar({ length: maxLength.url }).notNull(),
    /** The WebAuthn signature counter, unsigned 32-bit, stored after each assertion to detect a cloned authenticator. */
    counter: bigint({ mode: 'number' }).notNull().default(0),
    /** The transports the browser reported at registration (WebAuthn `getTransports()`); null when it reported none. */
    transports: varchar({ length: maxLength.field }).array(),
    deviceName: varchar({ length: maxLength.field }),
    deviceType: varchar({ enum: ['desktop', 'mobile'] })
      .notNull()
      .default('desktop'),
    deviceOs: varchar({ length: maxLength.field }),
    browser: varchar({ length: maxLength.field }),
    nameOnDevice: varchar({ length: maxLength.field }).notNull(),
    /**
     * What an export needs to carry the passkey to another authenticator, as registration reported it; null on a passkey
     * registered before the columns existed. The AAGUID names the authenticator model, the attestation format is `none`
     * for every passkey this app registers, the backup flags say whether the credential syncs, and the user handle is
     * the random id the browser registered it under.
     */
    aaguid: varchar({ length: 36 }),
    attestationFormat: varchar({ length: maxLength.field }),
    backupEligible: boolean(),
    backupState: boolean(),
    userHandle: varchar({ length: maxLength.field }),
    createdAt: timestampColumns.createdAt,
    /** The newest assertion that verified; null until the passkey signs in once. */
    lastUsedAt: isoTimestamp(),
  },
  (table) => [
    index('passkeys_user_id_idx').on(table.userId),
    // One account per credential: a sign-in finds the account by the credential id the authenticator presents.
    uniqueIndex('passkeys_credential_id_idx').on(table.credentialId),
  ],
);

export type InsertPasskeyModel = typeof passkeysTable.$inferInsert;
