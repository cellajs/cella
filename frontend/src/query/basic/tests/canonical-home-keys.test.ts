import { describe, expect, it, vi } from 'vitest';

// The canonical list options build their key at call time from placement ids only, but the module
// they live in pulls in the router and the persisted query client at import time. Stub both.
vi.mock('~/routes/-router-instance', () => ({ getRouter: () => ({ state: { matches: [] } }) }));
vi.mock('~/query/query-client', () => ({ queryClient: { getQueryData: () => undefined } }));

const { matchesCanonicalHome } = await import('~/query/basic/apply-entity-to-lists');
const { attachmentsCanonicalOptions } = await import('~/modules/attachment/query');

const tenantId = 'tenant-1';
const organizationId = 'org-1';

/**
 * Canonical list data must live under `keys.list.home`, the only shape the realtime splice can
 * place a row into. `registerEntityQueryKeys` validates the key builder, not where a module
 * actually caches, so only an assertion on the emitted query key catches a module that drifts.
 */
describe('product canonical options cache under a splice-able home key', () => {
  const cases = [
    {
      name: 'attachment at org depth',
      queryKey: attachmentsCanonicalOptions({ tenantId, organizationId }).queryKey,
      home: organizationId,
    },
  ];

  it.each(cases)('$name', ({ queryKey, home }) => {
    expect(matchesCanonicalHome(queryKey, organizationId, home)).toBe(true);
  });

  // Negative control: an extra scope segment makes the splice skip the key without reporting it.
  it('rejects a key with an extra scope segment', () => {
    expect(
      matchesCanonicalHome(['attachment', 'list', 'canonical', organizationId, 'extra-1'], organizationId, 'extra-1'),
    ).toBe(false);
  });
});
