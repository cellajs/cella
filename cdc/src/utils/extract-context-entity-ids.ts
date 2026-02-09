import { appConfig, hierarchy, type RelatableContextEntityType } from 'shared';
import { getRowValue } from './get-row-value';

/**
 * Type for dynamic context entity IDs extracted from a row.
 * Maps relatable context entity ID column names to their values.
 */
export type ContextEntityIds = {
  [K in (typeof appConfig.entityIdColumnKeys)[RelatableContextEntityType]]?: string | null;
};

/**
 * Extract all relatable context entity IDs from a row.
 * Only extracts IDs for entities in relatableContextEntityTypes (part of the parent tree).
 *
 * @param row - The row data with camelCase keys
 * @returns Object with context entity ID column names as keys
 */
export function extractContextEntityIds(row: Record<string, unknown>): ContextEntityIds {
  const contextEntityIds: ContextEntityIds = {};

  for (const contextEntityType of hierarchy.relatableContextTypes) {
    const columnKey = appConfig.entityIdColumnKeys[contextEntityType];
    contextEntityIds[columnKey] = getRowValue(row, columnKey) ?? null;
  }

  return contextEntityIds;
}
