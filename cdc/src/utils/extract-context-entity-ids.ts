import { appConfig } from 'shared';
import { type RelatableContextEntityType, relatableContextEntityTables } from '#/relatable-config';
import { getRowValue } from './get-row-value';

/** Relatable context entity types derived from relatableContextEntityTables (matches activities table columns). */
const relatableContextEntityTypes = Object.keys(relatableContextEntityTables) as RelatableContextEntityType[];

/**
 * Type for dynamic context entity IDs extracted from a row.
 * Maps relatable context entity ID column names to their values.
 * Uses relatableContextEntityTables to stay in sync with the activities table columns.
 */
export type ContextEntityIds = {
  [K in (typeof appConfig.entityIdColumnKeys)[RelatableContextEntityType]]?: string | null;
};

/**
 * Extract all relatable context entity IDs from a row.
 * Uses relatableContextEntityTables (same source as generateActivityContextColumns)
 * to stay in sync with the activities table columns.
 *
 * @param row - The row data with camelCase keys
 * @returns Object with context entity ID column names as keys
 */
export function extractContextEntityIds(row: Record<string, unknown>): ContextEntityIds {
  const contextEntityIds: ContextEntityIds = {};

  for (const contextEntityType of relatableContextEntityTypes) {
    const columnKey = appConfig.entityIdColumnKeys[contextEntityType];
    contextEntityIds[columnKey] = getRowValue(row, columnKey) ?? null;
  }

  return contextEntityIds;
}
