/** Prepared durable mutation: run with variables, already coalesced, or nothing to send. */
export type PreparedVars<TVars> = { kind: 'run'; vars: TVars } | { kind: 'coalesced' } | { kind: 'noop' };

/** Resolved by `mutateAsync` when the intent was coalesced or a no-op: removing a queued mutation does not settle its own promise, so awaiting callers would hang without this. */
export const COALESCED = Symbol('coalesced');

/** Method syntax keeps a react-query `UseMutationResult` structurally assignable under strictFunctionTypes without a cast, via method-parameter bivariance. */
interface Mutatable<TData, TVars> {
  mutate(vars: TVars, opts?: unknown): void;
  mutateAsync(vars: TVars, opts?: unknown): Promise<TData>;
}

/**
 * Prepares public input into durable variables once before execution: coalesced and empty async calls resolve immediately, synchronous calls issue nothing.
 * Compose over a plain mutation as `{ ...mutation, ...buildPreparedHandlers(mutation, prepare) }`.
 */
export function buildPreparedHandlers<TData, TVars, TInput>(
  mutation: Mutatable<TData, TVars>,
  prepare: (input: TInput) => PreparedVars<TVars>,
) {
  const mutate = (input: TInput, opts?: unknown) => {
    const prepared = prepare(input);
    if (prepared.kind === 'run') mutation.mutate(prepared.vars, opts);
  };

  const mutateAsync = async (input: TInput, opts?: unknown): Promise<TData | typeof COALESCED> => {
    const prepared = prepare(input);
    if (prepared.kind === 'run') return mutation.mutateAsync(prepared.vars, opts);
    return COALESCED;
  };

  return { mutate, mutateAsync };
}
