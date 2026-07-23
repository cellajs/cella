/** Prepared durable mutation: run with variables, already coalesced, or nothing to send. */
export type PreparedVars<TVars> = { kind: 'run'; vars: TVars } | { kind: 'coalesced' } | { kind: 'noop' };

/**
 * Sentinel resolved by `mutateAsync` when the intent was coalesced or was a no-op. Awaiting callers
 * proceed without hanging on a promise that never settles (removing a queued mutation from the
 * cache does not settle its own promise, so coalesced work is reported here, at the call site).
 */
export const COALESCED = Symbol('coalesced');

/**
 * The subset of a mutation the prepared handlers drive. Method syntax (not property-function syntax)
 * so a react-query `UseMutationResult` is structurally assignable under strictFunctionTypes without a
 * cast: its `mutate`/`mutateAsync` take a typed options arg that method-parameter bivariance accepts.
 */
interface Mutatable<TData, TVars> {
  mutate(vars: TVars, opts?: unknown): void;
  mutateAsync(vars: TVars, opts?: unknown): Promise<TData>;
}

/**
 * Prepare public input into durable variables once before mutation execution. Coalesced and empty
 * async calls resolve immediately; synchronous calls issue nothing. Pure, so unit-testable with a
 * fake mutation. Compose over a plain mutation: `{ ...mutation, ...buildPreparedHandlers(mutation, prepare) }`.
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
