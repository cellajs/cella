import '~/query/tests/query-client-env';
import type { ChannelEntityType, ProductEntityType } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

// An app's shape: tasks homed in a project below the organization.
vi.mock('shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared')>();
  const roles = actual.createRoleRegistry(['member'] as const);
  const hierarchy = actual
    .createEntityHierarchy(roles)
    .user()
    .organization({ roles: roles.all })
    .channel('project', { parent: 'organization', roles: roles.all })
    .product('task', { parent: 'project' })
    .build();
  return { ...actual, hierarchy, isChannel: hierarchy.isChannel, isProduct: hierarchy.isProduct };
});

const { queryClient } = await import('~/query/query-client');
const { archivedChannelIds } = await import('~/modules/entities/use-can');

// The synthetic types exist only in this file's shared mock, hence the casts.
const projectType = 'project' as ChannelEntityType;
const taskType = 'task' as ProductEntityType;

const task = { id: 't1', entityType: taskType, organizationId: 'org-1', projectId: 'p1' };

afterEach(() => queryClient.clear());

describe('archivedChannelIds', () => {
  it('names a channel row by its own flag', () => {
    expect([...archivedChannelIds({ id: 'p1', entityType: projectType, archived: true })]).toEqual(['p1']);
    expect([...archivedChannelIds({ id: 'p1', entityType: projectType, archived: false })]).toEqual([]);
  });

  it('names the home channel of a product row when its cached row is archived', () => {
    queryClient.setQueryData([projectType, 'detail', 'p1'], { id: 'p1', archived: true });
    expect([...archivedChannelIds(task)]).toEqual(['p1']);
  });

  it('counts a home channel the cache does not hold as live', () => {
    expect([...archivedChannelIds(task)]).toEqual([]);
  });
});
