import { appConfig, hasKey, hierarchy, isProductEntity } from 'shared';
import type { TableRegistryEntry } from '../types';

export interface SeqScope {
  /** Column name for the WHERE clause (e.g., 'organization_id', 'project_id') */
  scopeColumn: string;
  /** Value to match in the WHERE clause */
  scopeValue: string;
}

/**
 * Determine the sequence scope for an activity based on entity hierarchy.
 * Returns null for non-product entities (user, organization, etc.) since
 * seq counters are only used for product entity sync.
 *
 * Uses hierarchy.getOrderedAncestors() to get the ordered ancestor chain
 * (most specific first), then finds the first ancestor with a FK value in the row.
 *
 * Examples:
 * - task with projectId → scope by projectId
 * - attachment with only organizationId → scope by organizationId
 * - page without org → scope by entityType
 */
export function getSeqScope(entry: TableRegistryEntry, row: Record<string, unknown>): SeqScope | null {
  // Only product entities need sequence tracking
  if (entry.kind !== 'entity' || !isProductEntity(entry.type)) return null;
  // Get ancestors from hierarchy (already ordered most-specific first)
  const ancestors = hierarchy.getOrderedAncestors(entry.type);

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

  // Fallback: no context FK found (e.g., org-less product entity) - scope by entity type
  return { scopeColumn: 'entity_type', scopeValue: entry.type };
}
