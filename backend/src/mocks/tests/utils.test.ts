import { appConfig } from 'config';
import { describe, expect, it } from 'vitest';
import {
  generateMockContextEntityIdColumns,
  generateMockContextEntityIdColumnsWithConfig,
  withFakerSeed,
} from '../utils';

describe('generateMockContextEntityIdColumns', () => {
  it('returns correct column names for default config', () => {
    const columns = generateMockContextEntityIdColumns();

    // Should have a key for each context entity type
    for (const entityType of appConfig.contextEntityTypes) {
      const columnName = appConfig.entityIdColumnKeys[entityType];
      expect(columns).toHaveProperty(columnName);
      expect(typeof columns[columnName as keyof typeof columns]).toBe('string');
    }

    // Column count should match context entity types count
    expect(Object.keys(columns).length).toBe(appConfig.contextEntityTypes.length);
  });

  it('returns correct column names with additional context entity type', () => {
    // Test with extended config containing additional context entity type
    const extendedConfig = {
      contextEntityTypes: ['organization', 'workspace'] as const,
      entityIdColumnKeys: {
        ...appConfig.entityIdColumnKeys,
        workspace: 'workspaceId',
      },
    };

    const columns = generateMockContextEntityIdColumnsWithConfig(extendedConfig);

    // Should have organizationId and workspaceId
    expect(columns).toHaveProperty('organizationId');
    expect(columns).toHaveProperty('workspaceId');
    expect(Object.keys(columns).length).toBe(2);
  });

  it('generates deterministic values when wrapped in withFakerSeed', () => {
    const key = 'test-seed-key';

    const columns1 = withFakerSeed(key, generateMockContextEntityIdColumns);
    const columns2 = withFakerSeed(key, generateMockContextEntityIdColumns);

    // Same seed should produce same values
    expect(columns1).toEqual(columns2);
  });

  it('generates different values with different seeds', () => {
    const columns1 = withFakerSeed('seed-a', generateMockContextEntityIdColumns);
    const columns2 = withFakerSeed('seed-b', generateMockContextEntityIdColumns);

    // Different seeds should produce different values
    expect(columns1.organizationId).not.toBe(columns2.organizationId);
  });
});
