import { type UseMutationOptions, useMutation } from '@tanstack/react-query';

/**
 * Result of preparing public input into durable mutation variables:
 *   - `run`: issue the mutation with `vars`;
 *   - `coalesced`: the intent was folded into a queued mutation, issue nothing;
 *   - `noop`: nothing to send (e.g. an all-local selection was cancelled cache-side).
 */
export type PreparedVars<TVars> = { kind: 'run'; vars: TVars } | { kind: 'coalesced' } | { kind: 'noop' };

/**
 * Sentinel resolved by `mutateAsync` when the intent was coalesced or was a no-op. Awaiting callers
 * proceed without hanging on a promise that never settles (removing a queued mutation from the
 * cache does not settle its own promise, so coalesced work is reported here, at the call site).
 */
export const COALESCED = Symbol('coalesced');

/** The subset of a mutation the prepared handlers drive. */
interface Mutatable<TData, TVars> {
  mutate: (vars: TVars, opts?: unknown) => void;
  mutateAsync: (vars: TVars, opts?: unknown) => Promise<TData>;
}

/**
 * Wrap a mutation's `mutate`/`mutateAsync` with a preparation step that turns public input into
 * durable variables exactly once, before the mutation runs. Pure (no React), so it is unit-testable
 * with a fake mutation.
 *
 * `mutate` issues nothing for `coalesced`/`noop`. `mutateAsync` resolves immediately with COALESCED
 * for those, so callers that await (e.g. to close a dialog) never hang on coalesced or empty work.
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

/**
 * Hook form: run the mutation with `options` and expose `mutate`/`mutateAsync` that accept the
 * public input, preparing it (routing context, stx, offline coalescing) via `prepare`.
 */
export function usePreparedMutation<TData, TError, TVars, TContext, TInput>(
  options: UseMutationOptions<TData, TError, TVars, TContext>,
  prepare: (input: TInput) => PreparedVars<TVars>,
) {
  const mutation = useMutation(options);
  const { mutate, mutateAsync } = buildPreparedHandlers<TData, TVars, TInput>(
    mutation as Mutatable<TData, TVars>,
    prepare,
  );
  return { ...mutation, mutate, mutateAsync };
}
