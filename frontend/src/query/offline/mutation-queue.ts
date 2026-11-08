import type { QueryClient } from '@tanstack/react-query';
import type { ProductEntityType } from 'shared';
import { entityIdsOf } from '~/query/offline/mutation-variables';

/** Minimal shape of a mutation's observable state; avoids depending on the generic Mutation type. */
type MutationLike = { state: { status: string; isPaused: boolean; failureCount: number } };

/** Parked offline awaiting reconnect. A parked mutation whose attempt failed may have committed before its response was lost. */
export const isQueued = (mutation: MutationLike): boolean => mutation.state.status === 'pending' && mutation.state.isPaused;

/**
 * Parked before its first attempt, so its request never left the device: the only create an edit may fold into or a
 * delete may cancel. Under `offlineFirst` the first attempt runs even offline, so this is a mutation waiting behind
 * another of its scope.
 */
export const isUnsent = (mutation: MutationLike): boolean => isQueued(mutation) && mutation.state.failureCount === 0;

/** Any pending mutation (active or queued). True while a remote cache write should defer to optimistic state. */
export const isPending = (mutation: MutationLike): boolean => mutation.state.status === 'pending';

/**
 * The ids of the rows held by the entity type's mutations, under any key they start, that pass `test`, such as {@link isPending}.
 * @param idsOf - Reads a mutation's rows from its variables; `deletedIdsOf` keeps a delete's only.
 */
export function rowIdsOfMutations(
  client: QueryClient,
  entityType: ProductEntityType,
  test: (mutation: MutationLike) => boolean,
  idsOf: (variables: unknown) => string[] = entityIdsOf,
): Set<string> {
  const mutations = client.getMutationCache().findAll({ mutationKey: [entityType], predicate: test });
  return new Set(mutations.flatMap((mutation) => idsOf(mutation.state.variables)));
}

/** Whether a mutation of the entity type, under any key it starts, holds this row and passes `test`. */
export const hasMutationOfRow = (
  client: QueryClient,
  entityType: ProductEntityType,
  entityId: string,
  test: (mutation: MutationLike) => boolean,
): boolean => rowIdsOfMutations(client, entityType, test).has(entityId);
