import '~/query/tests/query-client-env';
import { hierarchy } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { session, getMyMemberships } = vi.hoisted(() => ({
  session: { isSystemAdmin: false, user: { id: 'user-1' } },
  getMyMemberships: vi.fn(async (): Promise<{ items: unknown[] }> => ({ items: [] })),
}));
vi.mock('sdk', async (importOriginal) => ({ ...(await importOriginal<typeof import('sdk')>()), getMyMemberships }));
vi.mock('~/modules/user/user-store', () => ({ useUserStore: { getState: () => session } }));
vi.mock('@tanstack/react-router', () => ({ redirect: (to: unknown) => ({ redirect: to }) }));

const { queryClient } = await import('~/query/query-client');
const { meKeys } = await import('~/modules/me/query');
const { requireEntityAction } = await import('~/routes/-permission-guard');

const memberRole = hierarchy.getLeastPrivilegedRole('organization');
const adminRole = hierarchy.getMostPrivilegedRole('organization');
const membership = (role: string, channelId = 'org-1') => ({ channelType: 'organization', channelId, organizationId: channelId, role });

// The row a slug fetch returns on a cold load: the API's own, before the enrichment pipeline put a membership on it.
const organization = { id: 'org-1', slug: 'acme' };
const settingsGate = () => requireEntityAction(organization, 'organization', 'organization', 'update', '/organization');
const redirected = { redirect: { to: '/organization', params: true, replace: true } };

describe('requireEntityAction', () => {
  afterEach(() => {
    queryClient.clear();
    session.isSystemAdmin = false;
    getMyMemberships.mockReset();
  });

  it('lets an admin through on a cold load: it fetches the memberships the row does not carry yet', async () => {
    getMyMemberships.mockResolvedValue({ items: [membership(adminRole)] });

    await expect(settingsGate()).resolves.toBeUndefined();
    expect(getMyMemberships).toHaveBeenCalledTimes(1);
  });

  it('redirects a member whose memberships hold no update, and one who holds it on another organization only', async () => {
    getMyMemberships.mockResolvedValue({ items: [membership(memberRole)] });
    await expect(settingsGate()).rejects.toEqual(redirected);

    queryClient.clear();
    getMyMemberships.mockResolvedValue({ items: [membership(adminRole, 'org-2')] });
    await expect(settingsGate()).rejects.toEqual(redirected);
  });

  it('reads cached memberships without a request, whatever their age', async () => {
    queryClient.setQueryData(meKeys.memberships, { items: [membership(adminRole)] }, { updatedAt: 1 });

    await expect(settingsGate()).resolves.toBeUndefined();
    expect(getMyMemberships).not.toHaveBeenCalled();
  });

  it('lets the caller through when the memberships cannot be read: the page and the server decide', async () => {
    getMyMemberships.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(settingsGate()).resolves.toBeUndefined();
  });

  it('lets a system admin through, with a membership that holds no update and with none', async () => {
    session.isSystemAdmin = true;
    getMyMemberships.mockResolvedValue({ items: [membership(memberRole)] });
    await expect(settingsGate()).resolves.toBeUndefined();

    queryClient.clear();
    getMyMemberships.mockResolvedValue({ items: [] });
    await expect(settingsGate()).resolves.toBeUndefined();
  });
});
