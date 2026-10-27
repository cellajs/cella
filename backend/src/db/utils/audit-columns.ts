import { uuid } from 'drizzle-orm/pg-core';
import type { ActorId } from '#/db/utils/ids';
import { isoTimestamp } from '#/db/utils/timestamp-columns';
import { actorsTable } from '#/modules/actors/actors-db';

/** A reference to the actor who wrote something, a user or a service account; null once that actor is gone. */
export const writerColumn = () =>
  uuid()
    .references(() => actorsTable.id, { onDelete: 'set null' })
    .$type<ActorId>();

/**
 * Who wrote a row and when, for every table a user or a service account writes. `createdAt` and `createdBy` are set
 * once; on entity tables the immutability trigger refuses a change. `updatedAt` and `updatedBy` are the row's last
 * write by any actor for any reason, so an edit, a publish and a soft delete all move them: `updateStamps()` is the one
 * way to set them. Responses carry each `*By` as an `ActorRef`.
 */
export const auditColumns = () => ({
  createdAt: isoTimestamp().defaultNow().notNull(),
  createdBy: writerColumn(),
  updatedAt: isoTimestamp(),
  updatedBy: writerColumn(),
});

/**
 * The tombstone of a synced product row: a deleted row stays so caches drop it on a range read. `deleteStamps()` sets
 * the pair together with the update pair.
 */
export const tombstoneColumns = () => ({ deletedAt: isoTimestamp(), deletedBy: writerColumn() });
