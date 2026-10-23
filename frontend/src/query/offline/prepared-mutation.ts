/** Prepared durable mutation: run with variables, already coalesced, or nothing to send. */
export type PreparedVars<TVars> = { kind: 'run'; vars: TVars } | { kind: 'coalesced' } | { kind: 'noop' };

/** Resolved by `mutateAsync` when the intent was coalesced or a no-op: removing a queued mutation does not settle its own promise, so awaiting callers would hang without this. */
export const coalescedResult = Symbol('coalesced');

/** Method syntax keeps a react-query `UseMutationResult` structurally assignable under strictFunctionTypes without a cast, via method-parameter bivariance. */
interface MutationHandles<TData, TVars> {
  mutate(variables: TVars, options?: unknown): void;
  mutateAsync(variables: TVars, options?: unknown): Promise<TData>;
}

/**
 * Prepares public input into durable variables once before execution: coalesced and empty async calls resolve immediately, synchronous calls issue nothing.
 * Compose over a plain mutation as `{ ...mutation, ...buildPreparedHandlers(mutation, prepare) }`.
 */
export function buildPreparedHandlers<TData, TVars, TInput>(
  mutation: MutationHandles<TData, TVars>,
  prepare: (input: TInput) => PreparedVars<TVars>,
) {
  const mutate = (input: TInput, options?: unknown) => {
    const prepared = prepare(input);
    if (prepared.kind === 'run') mutation.mutate(prepared.vars, options);
  };

  const mutateAsync = async (input: TInput, options?: unknown): Promise<TData | typeof coalescedResult> => {
    const prepared = prepare(input);
    if (prepared.kind === 'run') return mutation.mutateAsync(prepared.vars, options);
    return coalescedResult;
  };

  return { mutate, mutateAsync };
}
