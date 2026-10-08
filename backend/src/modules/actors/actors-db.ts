import { snakeCase, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId } from 'shared/utils/entity-id';
import type { ActorId } from '#/db/utils/ids';
import { timestampColumns } from '#/db/utils/timestamp-columns';

/** Who can act and be named in provenance: a human user, or a service account behind an API key. */
export const actorKinds = ['user', 'service'] as const;
export type ActorKind = (typeof actorKinds)[number];

/**
 * Supertable of actors. `users.id` and `service_accounts.id` are foreign keys to this id, so `createdBy` /
 * `updatedBy` / `deletedBy` on content reference any actor kind with one real constraint. Holds the discriminator and
 * the facts that change too often for the kind's own table, which the CDC publication carries: the version of a user's
 * role bindings and the actor's activity times. Every other fact lives on the kind's table. Rows are written by
 * `insertActors` (actors-queries.ts), always in the same transaction as the kind's row.
 */
export const actorsTable = snakeCase.table('actors', {
  id: uuid().primaryKey().$defaultFn(generateId).$type<ActorId>(),
  kind: varchar({ enum: actorKinds }).notNull(),
  /** A new random value on every write to the user's memberships (`db/membership-rules.ts`); keys the membership cache. */
  bindingsVersion: uuid().notNull().defaultRandom(),
  /**
   * A user's last authenticated GET on a session of their own (never an impersonation), or the last request a service
   * account's API key or token authenticated; written at most every five minutes (`middlewares/update-last-seen.ts`).
   */
  lastSeenAt: timestamp({ mode: 'string' }),
  /** The user's last completed sign-in; null until the first, which picks the welcome redirect and skips the new-device notice. */
  lastSignInAt: timestamp({ mode: 'string' }),
  createdAt: timestampColumns.createdAt,
});
