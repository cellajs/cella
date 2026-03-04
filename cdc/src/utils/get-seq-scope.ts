import { isProductEntity } from 'shared';
import type { TableRegistryEntry } from '../types';

/** Prefix for public (org-less) entity seq keys in contextCountersTable */
export const PUBLIC_SEQ_PREFIX = 'public';

/**
 * Seq scope — all sequences are stored in contextCountersTable.
 * Org-scoped entities use org ID as entityId.
 * Org-less entities use 'public:{entityType}' as entityId.
 */
export interface SeqScope {
  contextKey: string;
  column: 'seq' | 'mSeq';
  /** Product entity type for per-entityType seq tracking within orgs (e.g. 'attachment', 'page') */
  entityType?: string;
}

/**
 * Determine the sequence scope for an activity.
 *
 * For org-scoped product entities → increment seq on contextCountersTable (orgId)
 * For org-less product entities → increment seq on contextCountersTable (public:{type})
 * For membership resources → increment mSeq on contextCountersTable (orgId)
 * For other resources → null (no seq tracking)
 */
export function getSeqScope(entry: TableRegistryEntry, row: Record<string, unknown>): SeqScope | null {
  const orgId = row.organizationId;
  const hasOrgId = orgId && typeof orgId === 'string';

  // Product entities: track seq
  if (entry.kind === 'entity' && isProductEntity(entry.type)) {
    const contextKey = hasOrgId ? orgId : `${PUBLIC_SEQ_PREFIX}:${entry.type}`;
    // Include entityType for org-scoped entities so CDC can track per-entityType seq in counts JSONB
    return { contextKey, column: 'seq', entityType: hasOrgId ? entry.type : undefined };
  }

  // Membership resources: track mSeq on the org's contextCounters row
  if (entry.kind === 'resource' && entry.type === 'membership') {
    if (hasOrgId) return { contextKey: orgId, column: 'mSeq' };
    return null;
  }

  return null;
}
