import { onlineManager, type QueryClient } from '@tanstack/react-query';
import { entityIdsOf } from '~/query/offline/mutation-variables';

/** Minimal shape of a mutation's observable state; avoids depending on the generic Mutation type. */
type MutationLike = { state: { status: string; isPaused: boolean; failureCount: number } };

/** Parked offline awaiting reconnect. A parked mutation whose attempt failed may have committed before its response was lost. */
export function isQueued(mutation: MutationLike): boolean {
  return mutation.state.status === 'pending' && mutation.state.isPaused;
}

/**
 * Parked before its first attempt, so its request never left the device: the only create an edit may fold into or a
 * delete may cancel. Under `offlineFirst` the first attempt runs even offline, so this is a mutation waiting behind
 * another of its scope.
 */
export function isUnsent(mutation: MutationLike): boolean {
  return isQueued(mutation) && mutation.state.failureCount === 0;
}

/** Any pending mutation (active or queued). True while a remote cache write should defer to optimistic state. */
export function isPending(mutation: MutationLike): boolean {
  return mutation.state.status === 'pending';
}

/**
 * The ids of the rows held by the entity type's mutations, under any key they start, that pass `test`, such as {@link isPending}.
 * @param idsOf - Reads a mutation's rows from its variables; `deletedIdsOf` keeps a delete's only.
 */
export function rowIdsOfMutations(
  client: QueryClient,
  entityType: string,
  test: (mutation: MutationLike) => boolean,
  idsOf: (variables: unknown) => string[] = entityIdsOf,
): Set<string> {
  const mutations = client.getMutationCache().findAll({ mutationKey: [entityType], predicate: test });
  return new Set(mutations.flatMap((mutation) => idsOf(mutation.state.variables)));
}

/** Whether a mutation of the entity type, under any key it starts, holds this row and passes `test`. */
export function hasMutationOfRow(client: QueryClient, entityType: string, entityId: string, test: (mutation: MutationLike) => boolean): boolean {
  return rowIdsOfMutations(client, entityType, test).has(entityId);
}

/** Only offline-paused mutations may be coalesced or cancelled; online intent stays separate and scope-serialized for backend idempotency and LWW handling. */
export function canCoalesce(): boolean {
  return !onlineManager.isOnline();
}
