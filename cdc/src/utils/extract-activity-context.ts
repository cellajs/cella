import type { EntityType, ResourceType } from 'shared';
import type { TableRegistryEntry } from '../types';
import { extractContextEntityIds, type ContextEntityIds } from './extract-context-entity-ids';
import { getRowValue } from './get-row-value';

export interface ActivityContext extends ContextEntityIds {
  entityId: string | null;
  userId: string | null;
  tenantId: string | null;
  entityType: EntityType | null;
  resourceType: ResourceType | null;
}

/**
 * Extract common activity context from a row and table registry entry.
 * Uses the discriminated entry to determine entity vs resource type.
 * Dynamically extracts all relatable context entity IDs.
 */
export function extractActivityContext(
  entry: TableRegistryEntry,
  row: Record<string, unknown>,
): ActivityContext {
  // Discriminated union - TypeScript narrows based on kind
  const entityType = entry.kind === 'entity' ? entry.type : null;
  const resourceType = entry.kind === 'resource' ? entry.type : null;

  // Entity ID is only set for entity tables
  const entityId = entityType ? getRowValue(row, 'id') : null;

  // Try multiple columns for user ID
  const userId =
    getRowValue(row, 'modifiedBy') ??
    getRowValue(row, 'createdBy') ??
    getRowValue(row, 'userId') ??
    null;

  // Dynamically extract all relatable context entity IDs
  const contextEntityIds = extractContextEntityIds(row);

  // Extract tenant ID (nullable for cross-tenant entities like users)
  const tenantId = getRowValue(row, 'tenantId') ?? null;

  return {
    entityId,
    userId,
    tenantId,
    ...contextEntityIds,
    entityType: entityType as EntityType | null,
    resourceType: resourceType as ResourceType | null,
  };
}
