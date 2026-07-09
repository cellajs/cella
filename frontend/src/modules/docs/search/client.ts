import type { QueryClient } from '@tanstack/react-query';
import type { DocsSearchClient } from '~/modules/docs/search/types';

let clientPromise: Promise<DocsSearchClient> | null = null;

/**
 * Lazily create (once per session) the docs search client. The engine module is
 * dynamically imported so its weight only loads when search is actually used.
 */
export function getDocsSearchClient(queryClient: QueryClient): Promise<DocsSearchClient> {
  clientPromise ??= import('./metadata-client').then((m) => m.createMetadataClient(queryClient));
  return clientPromise;
}
