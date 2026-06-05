import { appConfig } from 'shared';
import { describe, expect, it } from 'vitest';
import {
  generateMockContextIdColumns,
  mockNanoid,
  mockTenantId,
  mockUuid,
  SCRIPT_ID_PREFIX,
  SCRIPT_UUID_PREFIX,
  setMockContext,
  withFakerSeed,
  withMockContext,
} from '../utils';

describe('generateMockContextIdColumns', () => {
  it('returns correct column names for default config', () => {
    const columns = generateMockContextIdColumns();

    // Should have a key for each context entity type
    for (const entityType of appConfig.contextEntityTypes) {
      const columnName = appConfig.entityIdColumnKeys[entityType];
      expect(columns).toHaveProperty(columnName);
      expect(typeof columns[columnName as keyof typeof columns]).toBe('string');
    }

    // Column count should match context entity types count
    expect(Object.keys(columns).length).toBe(appConfig.contextEntityTypes.length);
  });

  it('generates deterministic values when wrapped in withFakerSeed', () => {
    const key = 'test-seed-key';

    const columns1 = withFakerSeed(key, generateMockContextIdColumns);
    const columns2 = withFakerSeed(key, generateMockContextIdColumns);

    // Same seed should produce same values
    expect(columns1).toEqual(columns2);
  });

  it('generates different values with different seeds', () => {
    const columns1 = withFakerSeed('seed-a', generateMockContextIdColumns);
    const columns2 = withFakerSeed('seed-b', generateMockContextIdColumns);

    // Different seeds should produce different values
    expect(columns1.organizationId).not.toBe(columns2.organizationId);
  });
});

describe('withFakerSeed', () => {
  it('generates deterministic values with same seed', () => {
    const key = 'test-seed-key';

    const id1 = withFakerSeed(key, mockNanoid);
    const id2 = withFakerSeed(key, mockNanoid);

    expect(id1).toEqual(id2);
  });

  it('generates different values with different seeds', () => {
    const id1 = withFakerSeed('seed-a', mockNanoid);
    const id2 = withFakerSeed('seed-b', mockNanoid);

    expect(id1).not.toBe(id2);
  });
});

describe('mockNanoid', () => {
  it('generates IDs with default length of 24', () => {
    const id = mockNanoid();
    expect(id).toHaveLength(24);
  });

  it('generates IDs with custom length', () => {
    const id = mockNanoid(12);
    expect(id).toHaveLength(12);
  });

  it('generates IDs without prefix in example context (default)', () => {
    setMockContext('example');
    const id = mockNanoid();
    expect(id).not.toMatch(new RegExp(`^${SCRIPT_ID_PREFIX}`));
  });

  it('generates IDs with gen- prefix in script context', () => {
    const id = withMockContext('script', () => mockNanoid());
    expect(id).toMatch(new RegExp(`^${SCRIPT_ID_PREFIX}`));
    expect(id).toHaveLength(24);
  });

  it('restores context after withMockContext', () => {
    setMockContext('example');
    withMockContext('script', () => mockNanoid());
    const id = mockNanoid();
    expect(id).not.toMatch(new RegExp(`^${SCRIPT_ID_PREFIX}`));
  });
});

describe('mockTenantId', () => {
  it('generates a 6-character tenant ID', () => {
    const id = mockTenantId();
    expect(id).toHaveLength(6);
  });
});

describe('mockUuid', () => {
  it('generates a valid UUID', () => {
    setMockContext('example');
    const id = mockUuid();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('generates UUIDs with 00000000 prefix in script context', () => {
    const id = withMockContext('script', () => mockUuid());
    expect(id).toMatch(new RegExp(`^${SCRIPT_UUID_PREFIX}`));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('generates deterministic UUIDs with same seed', () => {
    const id1 = withFakerSeed('entity-seed', mockUuid);
    const id2 = withFakerSeed('entity-seed', mockUuid);
    expect(id1).toEqual(id2);
  });

  it('restores context after withMockContext', () => {
    setMockContext('example');
    withMockContext('script', () => mockUuid());
    const id = mockUuid();
    expect(id).not.toMatch(new RegExp(`^${SCRIPT_UUID_PREFIX}`));
  });
});
