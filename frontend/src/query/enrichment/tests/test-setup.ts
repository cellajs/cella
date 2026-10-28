import { QueryClient } from '@tanstack/react-query';
import { wideHierarchy } from 'shared/testing/wide-fixture';

/** Provides an isolated React Query client for enrichment tests. */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 } },
});

/** The types the mocked registry holds: the wide fixture's channel types, the only ones enrichment reads. */
export function mockGetRegisteredEntityTypes(): string[] {
  return [...wideHierarchy.channelTypes];
}

interface TestMembership {
  organizationId: string;
  channelType: string;
  channelId: string;
  archived: boolean;
  muted: boolean;
  displayOrder: number;
  role: string;
  [key: string]: unknown;
}

export function makeMembership(entityId: string, overrides?: Partial<TestMembership>): TestMembership {
  return {
    organizationId: entityId,
    channelType: 'organization',
    channelId: entityId,
    archived: false,
    muted: false,
    displayOrder: 0,
    role: 'member',
    ...overrides,
  };
}

export function makeInfiniteData(items: { id: string; membership?: TestMembership | null }[]) {
  return { pages: [{ items }], pageParams: [undefined] };
}

/** Real builder from the shared wide fixture: the deep-path import stays unmocked when tests vi.mock('shared'), so traversal runs the real class. */
export const mockHierarchy = wideHierarchy;

export const mockAppConfig = {
  channelEntityTypes: [...wideHierarchy.channelTypes] as string[],
  entityIdColumnKeys: wideHierarchy.idColumnKeys as Record<string, string>,
  entityActions: ['create', 'read', 'update', 'delete', 'search'] as string[],
  menuStructure: [
    { entityType: 'organization', subentityType: null },
    { entityType: 'workspace', subentityType: 'project' },
  ] as { entityType: string; subentityType: string | null }[],
};

/** Stub computeCan, returns all-false for each entity type (self + descendants). */
export function mockComputeCan(_policies: unknown, channelType: string): Record<string, Record<string, boolean>> {
  const denied = Object.fromEntries(mockAppConfig.entityActions.map((action) => [action, false]));
  const map: Record<string, Record<string, boolean>> = { [channelType]: { ...denied } };
  for (const descendant of mockHierarchy.getOrderedDescendants(channelType)) {
    map[descendant] = { ...denied };
  }
  return map;
}

export const mockPolicyMatrix = {};
