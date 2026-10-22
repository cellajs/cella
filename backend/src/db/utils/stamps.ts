import type { ActorId } from '#/db/utils/ids';
import { getIsoDate } from '#/utils/iso-date';

/**
 * The last-write stamps of a row with `auditColumns`: the one way `updatedAt` and `updatedBy` are set. Every write
 * spreads them, whatever its reason, so `updatedAt` is the moment of the row's last write and nothing else. The id's
 * brand passes through, so a user-only table (memberships) takes a user id and refuses a service account's.
 * @param actorId - Who writes: the request's actor, a user or a service account.
 * @param at - The moment, when the caller already holds it.
 */
export const updateStamps = <A extends ActorId>(actorId: A, at: string = getIsoDate()) => ({ updatedAt: at, updatedBy: actorId });

/** The tombstone of a product row with `tombstoneColumns`, which is also the row's last write. */
export const deleteStamps = <A extends ActorId>(actorId: A, at: string = getIsoDate()) => ({
  deletedAt: at,
  deletedBy: actorId,
  ...updateStamps(actorId, at),
});
