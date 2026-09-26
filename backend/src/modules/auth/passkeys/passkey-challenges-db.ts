import { index, snakeCase, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId } from 'shared/utils/entity-id';
import type { UserId } from '#/db/utils/ids';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { usersTable } from '#/modules/user/user-db';

/**
 * What a challenge was issued for: registering a passkey, signing in with one, the second factor of MFA, or a step-up
 * of a signed-in session. A response answers only a challenge of its own purpose.
 */
export const passkeyChallengePurposes = ['registration', 'authentication', 'mfa', 'step-up'] as const;
export type PasskeyChallengePurpose = (typeof passkeyChallengePurposes)[number];

/**
 * WebAuthn challenges handed out and not answered yet. Verifying a response deletes its challenge's row, whatever the
 * outcome, so a challenge answers one ceremony of its purpose at most once, also for a browser that kept a copy of its
 * cookie. The challenge itself lives in that signed cookie; the row stores its hash. Issuing a challenge sweeps expired
 * rows.
 */
export const passkeyChallengesTable = snakeCase.table(
  'passkey_challenges',
  {
    id: uuid().primaryKey().$defaultFn(generateId),
    challengeHash: varchar({ length: 64 }).notNull(),
    purpose: varchar({ enum: passkeyChallengePurposes }).notNull(),
    // The account an mfa or step-up challenge was issued for; null where the passkey names the account.
    userId: uuid()
      .references(() => usersTable.id, { onDelete: 'cascade' })
      .$type<UserId>(),
    createdAt: timestampColumns.createdAt,
    expiresAt: timestampColumns.expiresAt,
  },
  (table) => [
    uniqueIndex('passkey_challenges_challenge_hash_idx').on(table.challengeHash),
    index('passkey_challenges_expires_at_idx').on(table.expiresAt),
  ],
);
