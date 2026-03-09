import { hierarchy, isProductEntity } from 'shared';
import type { TableRegistryEntry } from '../types';

/** Prefix for public (org-less) entity seq keys in contextCountersTable */
const PUBLIC_SEQ_PREFIX = 'public';

/**
 * Seq scope — all sequences are stored in contextCountersTable.
 * Parent-scoped entities use the direct parent's ID as contextKey.
 * Parentless entities use 'public:{entityType}' as contextKey.
 */
export interface SeqScope {
  contextKey: string;
  column: 'seq' | 'mSeq';
}

/**
 * Determine the sequence scope for an activity.
 *
 * Hierarchy-aware: uses the entity's direct parent ID as context key.
 * For example, if attachment.parent = 'organization', key = row.organizationId.
 * If task.parent = 'project', key = row.projectId.
 * If page.parent = null, key = 'public:page'.
 *
 * For membership resources → increment mSeq on contextCountersTable (orgId)
 * For other resources → null (no seq tracking)
 *
 * Note: Per-entityType seq (counts['s:<entityType>']) is managed by the
 * stamp_entity_seq_at database trigger, not by CDC.
 */
export function getSeqScope(entry: TableRegistryEntry, row: Record<string, unknown>): SeqScope | null {
  // Product entities: track seq scoped to direct parent
  if (entry.kind === 'entity' && isProductEntity(entry.type)) {
    const parentType = hierarchy.getParent(entry.type);

    if (parentType) {
      // Parent-scoped: use the parent's ID column (e.g., organizationId, projectId)
      const parentIdKey = `${parentType}Id`;
      const parentId = row[parentIdKey];
      if (parentId && typeof parentId === 'string') {
        return { contextKey: parentId, column: 'seq' };
      }
      return null; // Missing parent ID — shouldn't happen
    }

    // Parentless: use 'public:{entityType}'
    return { contextKey: `${PUBLIC_SEQ_PREFIX}:${entry.type}`, column: 'seq' };
  }

  // Membership resources: track mSeq on the org's contextCounters row
  if (entry.kind === 'resource' && entry.type === 'membership') {
    const orgId = row.organizationId;
    if (orgId && typeof orgId === 'string') return { contextKey: orgId, column: 'mSeq' };
    return null;
  }

  return null;
}
