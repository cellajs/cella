import '~/query/tests/query-client-env';
import { hierarchy } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { listMyMemberships } = vi.hoisted(() => ({
  listMyMemberships: vi.fn(async (): Promise<{ items: unknown[] }> => ({ items: [] })),
}));
vi.mock('sdk', async (importOriginal) => ({ ...(await importOriginal<typeof import('sdk')>()), listMyMemberships }));
vi.mock('~/modules/user/user-store', () => ({ userStore: { getState: () => ({ isSystemAdmin: false, user: { id: 'user-1' } }) } }));
vi.mock('@tanstack/react-router', () => ({ redirect: (to: unknown) => ({ redirect: to }) }));

const { queryClient } = await import('~/query/query-client');
const { requireEntityAction } = await import('~/routes/-permission-guard');

const memberRole = hierarchy.getLeastPrivilegedRole('organization');
const adminRole = hierarchy.getMostPrivilegedRole('organization');
const membership = (role: string, channelId = 'org-1') => ({ channelType: 'organization', channelId, organizationId: channelId, role });

// The row a slug fetch returns on a cold load, before the memberships are cached.
const organization = { id: 'org-1', entityType: 'organization' as const, slug: 'acme' };
const settingsGate = () => requireEntityAction(organization, 'organization', 'update', '/organization');
const redirected = { redirect: { to: '/organization', params: true, replace: true } };

describe('requireEntityAction', () => {
  afterEach(() => {
    queryClient.clear();
    listMyMemberships.mockReset();
  });

  it('lets an admin through on a cold load: it fetches the memberships first', async () => {
    listMyMemberships.mockResolvedValue({ items: [membership(adminRole)] });

    await expect(settingsGate()).resolves.toBeUndefined();
    expect(listMyMemberships).toHaveBeenCalledTimes(1);
  });

  it('redirects a member whose memberships hold no update, and one who holds it on another organization only', async () => {
    listMyMemberships.mockResolvedValue({ items: [membership(memberRole)] });
    await expect(settingsGate()).rejects.toEqual(redirected);

    queryClient.clear();
    listMyMemberships.mockResolvedValue({ items: [membership(adminRole, 'org-2')] });
    await expect(settingsGate()).rejects.toEqual(redirected);
  });

  it('lets the caller through when the memberships cannot be read: the page and the server decide', async () => {
    listMyMemberships.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(settingsGate()).resolves.toBeUndefined();
  });
});
