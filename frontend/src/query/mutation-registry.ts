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

/**
 * Warns about restored mutations that hold no `mutationFn`: their module registered its defaults after the restore,
 * so their replay fails. Call it after the restore, before resuming. Returns the keys it warned about.
 */
export function warnMutationsWithoutDefaults(queryClient: QueryClient): unknown[] {
  const keys = queryClient
    .getMutationCache()
    .getAll()
    .filter((mutation) => mutation.state.isPaused && !mutation.options.mutationFn)
    .map((mutation) => mutation.options.mutationKey);
  if (keys.length > 0) {
    console.warn('[MutationRegistry] Restored mutations without a mutationFn; import their query.ts from the <name>-module.ts file', keys);
  }
  return keys;
}
