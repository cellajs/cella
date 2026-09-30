import '~/query/tests/query-client-env';
import type { MembershipBase } from 'sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichedChannel } from '~/modules/entities/types';

// The hooks return their options, so each lifecycle callback runs without rendering.
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useMutation: (options: unknown) => options,
}));
vi.mock('~/modules/common/toaster/toaster', () => ({
  toaster: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const { createEntityKeys } = await import('~/query/basic/create-query-keys');
const { registerEntityQueryKeys } = await import('~/query/basic/entity-query-registry');
const { queryClient } = await import('~/query/query-client');
const { meKeys } = await import('~/modules/me/query');
const { useChangeEntityRoleMutation } = await import('~/modules/memberships/query-mutations');

/** Mutation options as the mocked useMutation hands them back. */
type Options<TData, TVariables, TContext = unknown> = {
  onSuccess: (data: TData, variables: TVariables, context: TContext) => unknown;
};

const orgKeys = createEntityKeys<Record<string, never>>('organization');

const membership = (id: string, overrides: Partial<MembershipBase> = {}) =>
  ({
    id,
    tenantId: 'tenant-1',
    userId: 'me',
    channelType: 'organization',
    channelId: `channel-${id}`,
    role: 'member',
    ...overrides,
  }) as MembershipBase;

beforeEach(() => registerEntityQueryKeys('organization', orgKeys));
afterEach(() => queryClient.clear());

describe('useChangeEntityRoleMutation', () => {
  type RoleResult = { entity: EnrichedChannel; membership: MembershipBase; wasNew: boolean };
  // The mocked useMutation returns its options, which the hook's result type does not describe.
  const options = () => useChangeEntityRoleMutation() as unknown as Options<RoleResult, unknown>;

  it('writes the new membership into every organization list and into my memberships', () => {
    const flatKey = orgKeys.list.home('org-1');
    const infiniteKey = [...orgKeys.list.base, { q: '' }];
    const otherTypeKey = ['attachment', 'list', 'org-1', 'org-1'];
    queryClient.setQueryData(flatKey, { items: [{ id: 'org-1', name: 'One' }, { id: 'org-2' }], total: 2 });
    queryClient.setQueryData(infiniteKey, {
      pages: [{ items: [{ id: 'org-2' }, { id: 'org-1', name: 'One' }], total: 2 }],
      pageParams: [{ page: 0, offset: 0 }],
    });
    queryClient.setQueryData(otherTypeKey, { items: [{ id: 'org-1' }], total: 1 });
    queryClient.setQueryData(meKeys.memberships, { items: [membership('m-1', { channelId: 'org-1' })] });

    const updated = membership('m-1', { channelId: 'org-1', role: 'admin' });
    const entity = { id: 'org-1', entityType: 'organization', name: 'One' } as EnrichedChannel;
    options().onSuccess({ entity, membership: updated, wasNew: false }, undefined, undefined);

    const expectedRow = { ...entity, membership: updated };
    expect(queryClient.getQueryData(flatKey)).toEqual({ items: [expectedRow, { id: 'org-2' }], total: 2 });
    expect(queryClient.getQueryData(infiniteKey)).toEqual({
      pages: [{ items: [{ id: 'org-2' }, expectedRow], total: 2 }],
      pageParams: [{ page: 0, offset: 0 }],
    });
    expect(queryClient.getQueryData(otherTypeKey)).toEqual({ items: [{ id: 'org-1' }], total: 1 });
    expect(queryClient.getQueryData(meKeys.memberships)).toEqual({ items: [updated] });
  });

  it('leaves lists without the entity untouched', () => {
    const flatKey = orgKeys.list.home('org-1');
    const flat = { items: [{ id: 'org-2' }], total: 1 };
    queryClient.setQueryData(flatKey, flat);

    const entity = { id: 'org-1', entityType: 'organization' } as EnrichedChannel;
    options().onSuccess({ entity, membership: membership('m-1'), wasNew: true }, undefined, undefined);

    expect(queryClient.getQueryData(flatKey)).toBe(flat);
  });
});
