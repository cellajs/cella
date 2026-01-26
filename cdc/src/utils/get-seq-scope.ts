import { appConfig, getEntityAncestors, hasKey } from 'config';
import type { TableRegistryEntry } from '../types';

export interface SeqScope {
  /** Column name for the WHERE clause (e.g., 'organization_id', 'project_id') */
  scopeColumn: string;
  /** Value to match in the WHERE clause */
  scopeValue: string;
}

/**
 * Determine the sequence scope for an activity based on entityConfig hierarchy.
 *
 * Uses getEntityAncestors() from config to get the ordered ancestor chain
 * (most specific first), then finds the first ancestor with a FK value in the row.
 *
 * Examples:
 * - task with projectId → scope by projectId
 * - attachment with only organizationId → scope by organizationId
 * - page without org → scope by entityType
 */
export function getSeqScope(entry: TableRegistryEntry, row: Record<string, unknown>): SeqScope {
  // Get ancestors from entityConfig (already ordered most-specific first)
  const ancestors = getEntityAncestors(entry.type);

  for (const ancestor of ancestors) {
    if (!hasKey(appConfig.entityIdColumnKeys, ancestor)) continue;

    const fkColumnKey = appConfig.entityIdColumnKeys[ancestor];
    const value = row[fkColumnKey];

    if (value && typeof value === 'string') {
      // Convert camelCase to snake_case for SQL column name
      const snakeColumn = fkColumnKey.replace(/([A-Z])/g, '_$1').toLowerCase();
      return { scopeColumn: snakeColumn, scopeValue: value };
    }
  }

  // Fallback: no context FK found - scope by entity_type only
  // This handles org-less entities or resources
  return { scopeColumn: 'entity_type', scopeValue: entry.type };
}
