import { appConfig } from 'config';
import { describe, expect, it } from 'vitest';
import { generateContextEntityIdColumns } from '../generate-context-entity-columns';

describe('generateContextEntityIdColumns', () => {
  it('returns correct column names for default config', () => {
    const columns = generateContextEntityIdColumns();

    // Should have a key for each context entity type
    for (const entityType of appConfig.contextEntityTypes) {
      const columnName = appConfig.entityIdColumnKeys[entityType];
      expect(columns).toHaveProperty(columnName);
    }

    // Column count should match context entity types count
    expect(Object.keys(columns).length).toBe(appConfig.contextEntityTypes.length);
  });

  it('columns are drizzle varchar builders', () => {
    const columns = generateContextEntityIdColumns();

    for (const entityType of appConfig.contextEntityTypes) {
      const columnName = appConfig.entityIdColumnKeys[entityType];
      const column = columns[columnName as keyof typeof columns];

      // Drizzle column builders have config property
      expect(column).toHaveProperty('config');
      // Should be a varchar type (PgVarcharBuilder)
      expect(column.constructor.name).toBe('PgVarcharBuilder');
    }
  });

  it('always includes organizationId since organization is default context entity', () => {
    const columns = generateContextEntityIdColumns();

    // Organization is always a context entity type in cella
    expect(columns).toHaveProperty('organizationId');
    expect(appConfig.contextEntityTypes).toContain('organization');
  });
});
