import '~/query/tests/query-client-env';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { hierarchy, isProduct } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ user: { id: 'user-1' } as { id: string } | null, isSystemAdmin: false }));
vi.mock('~/modules/user/user-store', () => ({ useUserStore: (select: (state: typeof session) => unknown) => select(session) }));
// Never answers: a test that seeds no memberships sees them loading.
vi.mock('sdk', async (importOriginal) => ({ ...(await importOriginal<typeof import('sdk')>()), listMyMemberships: () => new Promise(() => {}) }));
const checkAccess = vi.hoisted(() => vi.fn());
vi.mock('shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared')>();
  checkAccess.mockImplementation(actual.checkAccess);
  return { ...actual, checkAccess };
});

const { queryClient } = await import('~/query/query-client');
const { meKeys } = await import('~/modules/me/query');
const { useCan } = await import('~/modules/entities/use-can');

type Can = ReturnType<typeof useCan>;

/** The `can` a component gets from `useCan` once these memberships are cached, or while none are. */
function canWith(memberships: { channelType: string; channelId: string; role: string }[] | null, options?: Parameters<typeof useCan>[0]): Can {
  if (memberships) queryClient.setQueryData(meKeys.memberships, { items: memberships });
  let can: Can | undefined;
  function Probe() {
    can = useCan(options);
    return null;
  }
  renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );
  if (!can) throw new Error('useCan did not render');
  return can;
}

const organization = { id: 'org-1', entityType: 'organization' as const, createdBy: null };
const on = (role: string) => [{ channelType: 'organization', channelId: organization.id, role }];
const product = hierarchy.getOrderedDescendants('organization').find(isProduct);

afterEach(() => {
  queryClient.clear();
  session.user = { id: 'user-1' };
  session.isSystemAdmin = false;
  checkAccess.mockClear();
});

describe('useCan', () => {
  it('asks about the row itself: the most privileged organization role may update it, the least privileged may not', () => {
    expect(canWith(on(hierarchy.getMostPrivilegedRole('organization')))('update', 'organization', organization)).toBe(true);
    queryClient.clear();
    expect(canWith(on(hierarchy.getLeastPrivilegedRole('organization')))('update', 'organization', organization)).toBe(false);
  });

  it.runIf(product)('asks about a new product row homed at the channel when there is no row', () => {
    if (!product) return;
    const can = canWith(on(hierarchy.getMostPrivilegedRole('organization')));
    expect(can('create', product, organization)).toBe(true);
    expect(can('create', product, { ...organization, id: 'org-2' })).toBe(false);
  });

  it('answers as a member only without the system-admin bypass', () => {
    session.isSystemAdmin = true;
    expect(canWith([])('delete', 'organization', organization)).toBe(true);
    expect(canWith([], { asMember: true })('delete', 'organization', organization)).toBe(false);
  });

  it('denies a signed-in user until the memberships load, without asking the engine', () => {
    session.isSystemAdmin = true;
    expect(canWith(null)('delete', 'organization', organization)).toBe(false);
    expect(checkAccess).not.toHaveBeenCalled();
  });

  it('asks as anonymous without a user, whatever memberships are cached', () => {
    session.user = null;
    expect(canWith(on(hierarchy.getMostPrivilegedRole('organization')))('update', 'organization', organization)).toBe(false);
  });
});
