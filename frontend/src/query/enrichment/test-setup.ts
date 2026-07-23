import { QueryClient } from '@tanstack/react-query';
import { wideHierarchy } from 'shared/testing/wide-fixture';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 } },
});

// --- Mock entity query registry ---

/** Query keys matching the StandardEntityKeys shape for test entity types */
function createMockEntityKeys(entityType: string) {
  return {
    all: [entityType],
    list: {
      base: [entityType, 'list'] as readonly unknown[],
      filtered: (filters: object) => [entityType, 'list', filters],
    },
    detail: {
      base: [entityType, 'detail'] as readonly unknown[],
      byId: (id: string) => [entityType, 'detail', id] as readonly unknown[],
    },
    create: [entityType, 'create'],
    update: [entityType, 'update'],
    delete: [entityType, 'delete'],
  };
}

const mockEntityQueryRegistry = new Map<string, ReturnType<typeof createMockEntityKeys>>();

// Register the test channel entity types
mockEntityQueryRegistry.set('organization', createMockEntityKeys('organization'));
mockEntityQueryRegistry.set('workspace', createMockEntityKeys('workspace'));
mockEntityQueryRegistry.set('project', createMockEntityKeys('project'));

export function mockGetEntityQueryKeys(entityType: string) {
  return mockEntityQueryRegistry.get(entityType);
}

export function mockGetRegisteredEntityTypes(): string[] {
  return Array.from(mockEntityQueryRegistry.keys());
}

export function mockHasEntityQueryKeys(entityType: string): boolean {
  return mockEntityQueryRegistry.has(entityType);
}

export function mockRegisterEntityQueryKeys(entityType: string, keys: ReturnType<typeof createMockEntityKeys>): void {
  mockEntityQueryRegistry.set(entityType, keys);
}

// --- Shared test helpers ---

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

// Real builder instance from the shared wide fixture (org with workspace/project siblings).
// The deep-path import stays unmocked when tests vi.mock('shared'), so traversal logic is
// the real class, never a hand-rolled twin.
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
export function mockComputeCan(channelType: string): Record<string, Record<string, boolean>> {
  const denied = Object.fromEntries(mockAppConfig.entityActions.map((a) => [a, false]));
  const map: Record<string, Record<string, boolean>> = { [channelType]: { ...denied } };
  for (const d of mockHierarchy.getOrderedDescendants(channelType)) {
    map[d] = { ...denied };
  }
  return map;
}

/** Stub access policies (empty) */
export const mockAccessPolicies = {};
