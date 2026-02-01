/**
 * Mutation defaults registry.
 *
 * For offline mutation persistence to work, mutationFn must be registered
 * globally via setMutationDefaults. This allows React Query to resume
 * paused mutations after page reload.
 *
 * Entity modules call addMutationRegistrar() at module load time to register
 * their mutation defaults. The query modules are explicitly imported in
 * provider.tsx AFTER this module is fully initialized, which triggers their
 * registration. Then initMutationDefaults() applies all registrations.
 *
 * @see https://tanstack.com/query/latest/docs/framework/react/guides/mutations#persist-mutations
 */

import type { QueryClient } from '@tanstack/react-query';

/** Registry of mutation default registration functions */
type MutationDefaultsRegistrar = (queryClient: QueryClient) => void;

const registrars: MutationDefaultsRegistrar[] = [];

/**
 * Register a mutation defaults registrar.
 * Call this from entity modules to register their mutations.
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
  registrars.push(registrar);
}

/**
 * Initialize all registered mutation defaults.
 * Call this once during app startup, before PersistQueryClientProvider restores.
 */
export function initMutationDefaults(queryClient: QueryClient): void {
  for (const registrar of registrars) {
    registrar(queryClient);
  }
  console.debug(`[MutationRegistry] Registered ${registrars.length} mutation default providers`);
}
