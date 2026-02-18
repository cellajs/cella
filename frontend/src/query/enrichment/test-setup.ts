import { QueryClient } from '@tanstack/react-query';

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

// Register the test context entity types
mockEntityQueryRegistry.set('organization', createMockEntityKeys('organization'));
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

export interface TestMembership {
  organizationId: string;
  contextType: string;
  archived: boolean;
  muted: boolean;
  displayOrder: number;
  role: string;
  [key: string]: unknown;
}

export function makeMembership(entityId: string, overrides?: Partial<TestMembership>): TestMembership {
  return {
    organizationId: entityId,
    contextType: 'organization',
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

export const mockAppConfig = {
  contextEntityTypes: ['organization', 'project'] as string[],
  entityIdColumnKeys: { organization: 'organizationId', project: 'projectId' } as Record<string, string>,
  entityActions: ['create', 'read', 'update', 'delete', 'search'] as string[],
};

const parentMap: Record<string, string | null> = {
  organization: null,
  project: 'organization',
};

const childrenMap: Record<string, string[]> = {
  organization: ['project'],
  project: [],
};

export const mockHierarchy = {
  isContext(entityType: string): boolean {
    return mockAppConfig.contextEntityTypes.includes(entityType);
  },
  getOrderedAncestors(entityType: string): string[] {
    const ancestors: string[] = [];
    let current = parentMap[entityType] ?? null;
    while (current !== null) {
      ancestors.push(current);
      current = parentMap[current] ?? null;
    }
    return ancestors;
  },
  hasAncestor(entityType: string, ancestor: string): boolean {
    return this.getOrderedAncestors(entityType).includes(ancestor);
  },
  getOrderedDescendants(contextType: string): string[] {
    const descendants: string[] = [];
    const queue = [...(childrenMap[contextType] ?? [])];
    let i = 0;
    while (i < queue.length) {
      const current = queue[i++];
      descendants.push(current);
      queue.push(...(childrenMap[current] ?? []));
    }
    return descendants;
  },
};

/** Stub computeCan — returns all-false for each entity type (self + descendants) */
export function mockComputeCan(contextType: string): Record<string, Record<string, boolean>> {
  const denied = Object.fromEntries(mockAppConfig.entityActions.map((a) => [a, false]));
  const map: Record<string, Record<string, boolean>> = { [contextType]: { ...denied } };
  for (const d of mockHierarchy.getOrderedDescendants(contextType)) {
    map[d] = { ...denied };
  }
  return map;
}

/** Stub access policies (empty) */
export const mockAccessPolicies = {};
