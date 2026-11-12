import { QueryClient } from '@tanstack/react-query';
import { wideHierarchy } from 'shared/testing/wide-fixture';

/** Provides an isolated React Query client for enrichment tests. */
export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

/** The types the mocked registry holds: the wide fixture's channel types, the only ones enrichment reads. */
export function mockGetRegisteredEntityTypes(): string[] {
  return [...wideHierarchy.channelTypes];
}

export function makeInfiniteData(items: { id: string; slug?: string; organizationId?: string }[]) {
  return { pages: [{ results: items }], pageParams: [undefined] };
}

/** Real builder from the shared wide fixture: the deep-path import stays unmocked when tests vi.mock('shared'), so traversal runs the real class. */
export const mockHierarchy = wideHierarchy;

export const mockAppConfig = {
  channelEntityTypes: [...wideHierarchy.channelTypes] as string[],
  entityIdColumnKeys: wideHierarchy.idColumnKeys as Record<string, string>,
};
