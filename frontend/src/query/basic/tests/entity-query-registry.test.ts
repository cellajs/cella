import { describe, expect, it } from 'vitest';
import { createEntityKeys } from '~/query/basic/create-query-keys';
import { registerEntityQueryKeys } from '~/query/basic/entity-query-registry';

// The registry only needs an EntityType-shaped string; 'attachment' exists in every config.
const entityType = 'attachment' as const;

describe('registerEntityQueryKeys key-contract validation', () => {
  it('refuses at load a key builder the live splice cannot route', () => {
    const keys = createEntityKeys(entityType);
    const broken = {
      'a home key without the home-channel id': {
        ...keys,
        list: { ...keys.list, home: (organizationId: string) => [entityType, 'list', organizationId] },
      },
      'a list key under another prefix': {
        ...keys,
        list: { ...keys.list, home: (organizationId: string, homeChannelId?: string) => ['lists', entityType, organizationId, homeChannelId] },
      },
      'a detail key without the entity id': { ...keys, detail: { ...keys.detail, byId: () => [entityType, 'detail'] } },
    };

    for (const [name, brokenKeys] of Object.entries(broken)) {
      expect(() => registerEntityQueryKeys(entityType, brokenKeys), name).toThrow(/createEntityKeys contract/);
    }
  });
});
