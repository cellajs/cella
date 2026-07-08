import type { QueryClient } from '@tanstack/react-query';

/** Registry of mutation default registration functions. */
type MutationDefaultsRegistrar = (queryClient: QueryClient) => void;

const registrars: MutationDefaultsRegistrar[] = [];
let storedClient: QueryClient | null = null;

/**
 * Register a mutation defaults registrar.
 * If the queryClient is already initialized, the registrar is applied immediately.
 * Otherwise it's buffered and applied when initMutationDefaults() runs.
 *
 * @example
 * ```ts
 * // In pages/query.ts
 * addMutationRegistrar((qc) => {
 *   qc.setMutationDefaults(keys.create, { mutationFn: ... });
 * });
 * ```
 */
export function addMutationRegistrar(registrar: MutationDefaultsRegistrar): void {
  if (storedClient) {
    registrar(storedClient);
  } else {
    registrars.push(registrar);
  }
}

/**
 * Initialize buffered mutation defaults and store the client for future registrations.
 * Call this once during app startup, before PersistQueryClientProvider restores.
 *
 * @see https://tanstack.com/query/latest/docs/framework/react/guides/mutations#persist-mutations
 */
export function initMutationDefaults(queryClient: QueryClient): void {
  storedClient = queryClient;
  const count = registrars.length;
  for (const registrar of registrars) {
    registrar(queryClient);
  }
  registrars.length = 0;
  console.debug(`[MutationRegistry] Initialized (${count} buffered, late registrations apply immediately)`);
}
