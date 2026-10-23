import { hierarchy } from 'shared';
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
  const attachmentsLiveBelowOrganization = hierarchy.possibleHomeChannels('attachment').some((type) => type !== 'organization');
  const attachmentKey = attachmentsCanonicalOptions({ tenantId, organizationId }).queryKey;

  it.runIf(!attachmentsLiveBelowOrganization)('attachment at org depth', () => {
    expect(matchesCanonicalHome(attachmentKey, organizationId, organizationId)).toBe(true);
  });

  // An org-wide list of rows homed in several channels is no home list: it must be a filtered key, which sync invalidates.
  it.runIf(attachmentsLiveBelowOrganization)('attachment below the organization: the org-wide list under a filtered key', () => {
    expect(matchesCanonicalHome(attachmentKey, organizationId, organizationId)).toBe(false);
    expect(attachmentKey.slice(2).some((segment) => typeof segment === 'object' && segment !== null)).toBe(true);
  });
});
