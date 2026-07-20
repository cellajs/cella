import { describe, expect, it } from 'vitest';
import { createEntityKeys } from '~/query/basic/create-query-keys';
import { getEntityQueryKeys, registerEntityQueryKeys } from '~/query/basic/entity-query-registry';

// The registry only needs an EntityType-shaped string; 'attachment' exists in every config.
const entityType = 'attachment' as const;

describe('registerEntityQueryKeys key-contract validation', () => {
  it('accepts keys built with createEntityKeys (green path)', () => {
    const keys = createEntityKeys(entityType);
    expect(() => registerEntityQueryKeys(entityType, keys)).not.toThrow();
    expect(getEntityQueryKeys(entityType)).toBe(keys);
  });

  it('accepts hand-rolled keys that carry ids inside filter objects', () => {
    const keys = createEntityKeys(entityType);
    const filterStyle = {
      ...keys,
      list: {
        ...keys.list,
        home: (organizationId: string, homeChannelId?: string) => [
          entityType,
          'list',
          { organizationId, channelId: homeChannelId ?? organizationId },
        ],
      },
    };
    expect(() => registerEntityQueryKeys(entityType, filterStyle)).not.toThrow();
  });

  it('throws when list.home drops the home-channel id', () => {
    const keys = createEntityKeys(entityType);
    const broken = {
      ...keys,
      list: { ...keys.list, home: (organizationId: string) => [entityType, 'list', organizationId] },
    };
    expect(() => registerEntityQueryKeys(entityType, broken)).toThrow(/list\.home.*home-channel/);
  });

  it('throws when list keys do not start with [entityType, "list"]', () => {
    const keys = createEntityKeys(entityType);
    const broken = {
      ...keys,
      list: {
        ...keys.list,
        home: (organizationId: string, homeChannelId?: string) => ['lists', entityType, organizationId, homeChannelId],
      },
    };
    expect(() => registerEntityQueryKeys(entityType, broken)).toThrow(/createEntityKeys contract/);
  });

  it('throws when detail.byId drops the entity id', () => {
    const keys = createEntityKeys(entityType);
    const broken = { ...keys, detail: { ...keys.detail, byId: () => [entityType, 'detail'] } };
    expect(() => registerEntityQueryKeys(entityType, broken)).toThrow(/detail\.byId/);
  });
});
