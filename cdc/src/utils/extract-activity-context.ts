import type { EntityType } from 'config';
import type { ResourceType } from '#/table-config';
import type { TableRegistryEntry } from '../types';
import { getRowValue } from './get-row-value';

export interface ActivityContext {
  entityId: string | null;
  userId: string | null;
  organizationId: string | null;
  entityType: EntityType | null;
  resourceType: ResourceType | null;
}

/**
 * Extract common activity context from a row and table registry entry.
 * Uses the discriminated entry to determine entity vs resource type.
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

  // Organization ID
  const organizationId = getRowValue(row, 'organizationId') ?? null;

  return {
    entityId,
    userId,
    organizationId,
    entityType: entityType as EntityType | null,
    resourceType: resourceType as ResourceType | null,
  };
}
