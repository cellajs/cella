import type { QueryClient } from '@tanstack/react-query';

type MutationDefaultsRegistrar = (queryClient: QueryClient) => void;

const registrars: MutationDefaultsRegistrar[] = [];
let storedClient: QueryClient | null = null;

/** Register mutation defaults immediately after query initialization or buffer them until then. */
export function addMutationRegistrar(registrar: MutationDefaultsRegistrar): void {
  if (storedClient) {
    registrar(storedClient);
  } else {
    registrars.push(registrar);
  }
}

/**
 * Applies buffered mutation defaults and stores the client for later registrations. Call once at startup, before PersistQueryClientProvider restores.
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
