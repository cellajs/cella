import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeInfiniteData,
  makeMembership,
  mockAppConfig,
  mockGetRegisteredEntityTypes,
  mockHierarchy,
  queryClient,
} from '~/query/enrichment/tests/test-setup';

const session = vi.hoisted(() => ({ isSystemAdmin: false }));
vi.mock('~/modules/user/user-store', () => ({ userStore: { getState: () => session } }));

// The real map over the wide fixture: an organization with projects below it, whose admins manage every project and
// whose members only read them. No role is elevated, so an organization grant reaches no task of a project.
vi.mock('shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared')>();
  const { configureWidePermissions, wideOverrides } = await import('shared/testing/wide-fixture');
  const { policyMatrix } = configureWidePermissions(({ entityType, channels }) => {
    if (entityType === 'project') {
      channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
      channels.organization.member({ read: 1 });
      channels.project.member({ read: 1, update: 'own' });
    }
    if (entityType === 'task') {
      channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
      channels.project.member({ create: 1, read: 1, update: 'own' });
    }
  });
  return {
    appConfig: mockAppConfig,
    hierarchy: mockHierarchy,
    isChannel: mockHierarchy.isChannel,
    allActionsAllowed: actual.allActionsAllowed,
    policyMatrix,
    computeCan: (channelType: never, grants: never) => actual.computeCan(channelType, grants, policyMatrix, wideOverrides),
  };
});
vi.mock('~/query/query-client', () => ({ queryClient }));
vi.mock('~/modules/me/query', () => ({ meKeys: { memberships: ['me', 'memberships'], invites: ['me', 'invites'] } }));
vi.mock('~/query/basic/entity-query-registry', () => ({ getRegisteredEntityTypes: mockGetRegisteredEntityTypes }));

const { initChannelEnrichment } = await import('~/query/enrichment/init-enrichment');

const every = { create: true, read: true, update: true, delete: true };
const none = { create: false, read: false, update: false, delete: false };

/** A membership on project `p1` of organization `org-1`. */
const onProject = (role: string) => makeMembership('p1', { channelType: 'project', organizationId: 'org-1', role });
const project = { id: 'p1', organizationId: 'org-1' };

describe('the can map of a cached channel row', () => {
  let unsubscribe: (() => void) | undefined;

  /** The project row the pipeline enriched once these memberships are the caller's. */
  const rowWith = (memberships: unknown[]) => {
    unsubscribe = initChannelEnrichment();
    queryClient.setQueryData(['me', 'memberships'], { items: memberships });
    queryClient.setQueryData(['project', 'list'], makeInfiniteData([project]));
    type CanMap = Record<string, Record<string, unknown>>;
    const data = queryClient.getQueryData(['project', 'list']) as { pages: { items: { can?: CanMap; memberCan?: CanMap }[] }[] };
    return data.pages[0].items[0];
  };

  /** The `can` map the pipeline put on the project once these memberships are the caller's. */
  const canWith = (memberships: unknown[]) => rowWith(memberships).can;

  beforeEach(() => queryClient.clear());

  afterEach(() => {
    unsubscribe?.();
    queryClient.clear();
    session.isSystemAdmin = false;
  });

  it('holds what a membership above the row grants to a caller who is no member of the row', () => {
    const can = canWith([makeMembership('org-1', { role: 'admin' })]);

    expect(can?.project).toEqual(every);
    // Not elevated: the organization grant reaches no task homed at the project.
    expect(can?.task).toEqual(none);
  });

  it('merges the membership on the row with the one above it, and leaves out a membership of another organization', () => {
    const can = canWith([onProject('member'), makeMembership('org-1', { role: 'member' }), makeMembership('org-2', { role: 'admin' })]);

    expect(can?.project).toEqual({ create: false, read: true, update: 'own', delete: false });
    expect(can?.task).toEqual({ create: true, read: true, update: 'own', delete: false });
  });

  it('holds every action for a system admin, with a membership on the row and with none at all', () => {
    session.isSystemAdmin = true;
    expect(canWith([onProject('member')])?.project).toEqual(every);

    unsubscribe?.();
    queryClient.clear();
    // Memberships loaded and empty: the rows are still enriched.
    expect(canWith([])?.task).toEqual(every);
  });

  it('keeps what the memberships alone grant beside the every action of a system admin', () => {
    session.isSystemAdmin = true;
    const row = rowWith([onProject('member')]);

    expect(row.can?.project).toEqual(every);
    expect(row.memberCan?.project).toEqual({ create: false, read: true, update: 'own', delete: false });
  });

  it('puts the one map in both for a caller who is no system admin', () => {
    const row = rowWith([onProject('member')]);

    expect(row.memberCan).toBe(row.can);
  });
});
