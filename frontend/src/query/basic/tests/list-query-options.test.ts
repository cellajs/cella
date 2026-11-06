import '~/query/tests/query-client-env';
import { hierarchy } from 'shared';
import { describe, expect, it, vi } from 'vitest';

// The organization's least privileged role, whatever the app calls it.
const memberRole = hierarchy.getLeastPrivilegedRole('organization');

// The list endpoints answer an empty page; each case reads the request the fetcher sent.
vi.mock('sdk', async (importOriginal) => {
  const page = () => vi.fn(async () => ({ results: [], totalSize: 0 }));
  return { ...(await importOriginal<typeof import('sdk')>()), listOrganizations: page(), listMembers: page() };
});

const sdk = await import('sdk');
const { organizationsListQueryOptions, fetchOrganizationsForExport } = await import('~/modules/organization/query');
const { fetchMembersForExport } = await import('~/modules/memberships/query');

const path = { tenantId: 'tenant-1', organizationId: 'org-1' };
const channel = { entityId: 'org-1', entityType: 'organization' as const, ...path };

describe('included parts on mount', () => {
  const cached = (rows: { included?: Record<string, unknown> }[]) => ({
    state: { data: { pages: [{ results: rows, totalSize: rows.length }], pageParams: [''] } },
  });

  it('refetches a fresh list missing an asked-for part, and only then', () => {
    const askingForBoth = organizationsListQueryOptions({ include: 'counts,members' }).refetchOnMount as (query: unknown) => unknown;

    expect(organizationsListQueryOptions({}).refetchOnMount).toBe(true);
    expect(organizationsListQueryOptions({ include: 'membership' }).refetchOnMount).toBe(true);
    expect(askingForBoth(cached([{ included: {} }]))).toBe('always');
    expect(askingForBoth(cached([{ included: { counts: {} } }]))).toBe('always');
    expect(askingForBoth(cached([{ included: { counts: {}, members: [] } }]))).toBe(true);
    expect(askingForBoth(cached([]))).toBe(true);
  });
});

describe('export fetchers', () => {
  it('ask for the parts their export columns read: counts and my membership for organizations, counts and MFA for members', async () => {
    await fetchOrganizationsForExport({}, { maxPageSize: 1000 });
    await fetchMembersForExport({ ...channel, role: memberRole }, { maxPageSize: 1000 });

    expect(vi.mocked(sdk.listOrganizations).mock.lastCall?.[0]).toMatchObject({ query: { include: 'counts,membership' } });
    expect(vi.mocked(sdk.listMembers).mock.lastCall?.[0]).toMatchObject({ query: { include: 'counts,mfa', entityId: 'org-1' }, path });
  });
});
