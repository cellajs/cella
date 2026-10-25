import '~/query/tests/query-client-env';
import { hierarchy } from 'shared';
import { describe, expect, it, vi } from 'vitest';

// The organization's least privileged role, whatever the app calls it.
const memberRole = hierarchy.getLeastPrivilegedRole('organization');

// The list endpoints answer an empty page; each case reads the request the fetcher sent.
vi.mock('sdk', async (importOriginal) => {
  const page = () => vi.fn(async () => ({ items: [], total: 0 }));
  return { ...(await importOriginal<typeof import('sdk')>()), getOrganizations: page(), getMembers: page() };
});

const sdk = await import('sdk');
const { organizationsListQueryOptions, fetchOrganizationsForExport } = await import('~/modules/organization/query');
const { fetchMembersForExport } = await import('~/modules/memberships/query');

const path = { tenantId: 'tenant-1', organizationId: 'org-1' };
const channel = { entityId: 'org-1', entityType: 'organization' as const, ...path };

describe('included parts on mount', () => {
  const cached = (rows: { included?: Record<string, unknown> }[]) => ({
    state: { data: { pages: [{ items: rows, total: rows.length }], pageParams: [{ page: 0, offset: 0 }] } },
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
    await fetchOrganizationsForExport({ limit: 1000 });
    await fetchMembersForExport({ ...channel, role: memberRole, limit: 1000 });

    expect(vi.mocked(sdk.getOrganizations).mock.lastCall?.[0]).toMatchObject({ query: { include: 'counts,membership' } });
    expect(vi.mocked(sdk.getMembers).mock.lastCall?.[0]).toMatchObject({ query: { include: 'counts,mfa', entityId: 'org-1' }, path });
  });
});
