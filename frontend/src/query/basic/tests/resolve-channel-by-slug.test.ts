import '~/query/tests/query-client-env';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({ redirect: (to: unknown) => ({ redirect: to }) }));

const { queryClient } = await import('~/query/query-client');
const { resolveChannelBySlug } = await import('~/query/basic/resolve-channel-by-slug');

type Channel = { id: string; slug: string; included?: { counts?: { membership: { pending: number } } } };

const detailKey = (id: string) => ['organization', 'detail', id] as const;
const listRow: Channel = { id: 'org-1', slug: 'acme' };
const stored: Channel = { ...listRow, included: { counts: { membership: { pending: 3 } } } };

/**
 * Resolves `acme` with the row found in a list cache and a detail fetch that answers `stored`: as a route does on entry,
 * or with `revalidateIfStale: false` as on a param change within the route (`stay`).
 */
const resolveOnEnter = (fetchDetail: () => Promise<Channel>, revalidateIfStale = true, findInCache: () => Channel | undefined = () => listRow) =>
  resolveChannelBySlug({
    idOrSlug: 'acme',
    tenantId: 'ten-1',
    findInCache,
    detailQueryOptions: (id) => ({ queryKey: detailKey(id), queryFn: fetchDetail }),
    fetchBySlug: fetchDetail,
    revalidateIfStale,
    params: { organizationSlug: 'acme' },
    buildSlugOverrides: (entity) => ({ organizationSlug: entity.slug }),
  });

describe('resolveChannelBySlug', () => {
  afterEach(() => queryClient.clear());

  it('fetches the detail behind a list row it resolved from, on entering the route and on a param change within it, since a list row is no detail', async () => {
    for (const revalidateIfStale of [true, false]) {
      queryClient.clear();
      const fetchDetail = vi.fn(async () => stored);

      // The navigation resolves with the list row, without waiting for the fetch.
      expect(await resolveOnEnter(fetchDetail, revalidateIfStale)).toEqual(listRow);

      await vi.waitFor(() => expect(queryClient.getQueryData(detailKey('org-1'))).toEqual(stored));
      expect(fetchDetail).toHaveBeenCalledTimes(1);
    }
  });

  it('asks the server before it rewrites the URL when the list row that matched it and the cached detail name two slugs', async () => {
    // Another session renamed the channel: the list holds the new slug, which the URL names, and the detail the old one.
    queryClient.setQueryData(detailKey('org-1'), { ...stored, slug: 'acme-before-rename' });
    const fetchDetail = vi.fn(async () => stored);

    expect(await resolveOnEnter(fetchDetail)).toEqual(stored);
  });

  it('fetches by slug when no row is cached, and caches the answer under the key of its detail query', async () => {
    const fetchBySlug = vi.fn(async () => stored);

    expect(await resolveOnEnter(fetchBySlug, true, () => undefined)).toEqual(stored);
    expect(queryClient.getQueryData(detailKey('org-1'))).toEqual(stored);
    expect(fetchBySlug).toHaveBeenCalledTimes(1);
  });
});
