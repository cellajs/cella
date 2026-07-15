import type { QueryClient } from '@tanstack/react-query';

/** Registry of mutation default registration functions. */
type MutationDefaultsRegistrar = (queryClient: QueryClient) => void;

const registrars: MutationDefaultsRegistrar[] = [];
let storedClient: QueryClient | null = null;

/**
 * Register a mutation-defaults registrar. Applied immediately if the queryClient is already
 * initialized, otherwise buffered until initMutationDefaults() runs.
 *
 * @example
 * ```ts
 * addMutationRegistrar((qc) => qc.setMutationDefaults(keys.create, { mutationFn: ... }));
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
 * Apply buffered mutation defaults and store the client for later registrations. Call once at
 * startup, before PersistQueryClientProvider restores.
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
