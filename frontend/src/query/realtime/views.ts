import {
  hierarchy as appHierarchy,
  type EntityHierarchy,
  getEntityPolicies,
  getPolicyPermissions,
  type PolicyMatrix,
  policyMatrix,
} from 'shared';

/** Grant-boundary view shape (cursor is owned by the sync store, not the derivation). */
export interface DerivedSyncView {
  key: string;
  organizationId: string;
  prefixes: string[];
  entityTypes: string[];
  depth: 'self' | 'subtree';
}

export interface ViewMembership {
  organizationId: string;
  channelType: string;
  channelId: string;
  role: string;
}

export interface DeriveViewsInput {
  memberships: ViewMembership[];
  /** Product entity types to derive views for (registered sync types). */
  entityTypes: readonly string[];
  /** Canonical path for a channel, from cached channel entities; null = unknown → grant skipped. */
  resolvePath: (channelType: string, channelId: string) => string | null;
  /** Injectable for synthetic-hierarchy tests; default to the app's real config. */
  policies?: PolicyMatrix;
  hierarchy?: EntityHierarchy;
  /** Channel-qualified subtree-grant keys; defaults to the hierarchy's compiled set. */
  elevatedGrants?: ReadonlySet<string>;
}

/** Derives provable subtree or self views at unconditional grant boundaries; conditional grants and unknown paths keep only the organization fallback. */
export function deriveGrantBoundaryViews({
  memberships,
  entityTypes,
  resolvePath,
  policies = policyMatrix,
  hierarchy = appHierarchy,
  elevatedGrants = hierarchy.elevatedGrants,
}: DeriveViewsInput): DerivedSyncView[] {
  const views = new Map<string, DerivedSyncView>();

  for (const entityType of entityTypes) {
    const entityPolicies = getEntityPolicies(entityType, policies);
    // Ancestors are most-specific → organization; the home level is the first one below it.
    const ancestors = hierarchy.getOrderedAncestors(entityType);
    const homeLevel = ancestors.find((a) => a !== 'organization') ?? 'organization';
    // Mirrors the engine's isHomeScopedGrant; the hierarchy-compiled set is always present.
    const isSubtreeGrant = (channelType: string, role: string) =>
      channelType === homeLevel || elevatedGrants.has(`${channelType}:${role}`);

    for (const m of memberships) {
      if (!ancestors.includes(m.channelType)) continue;
      if (getPolicyPermissions(entityPolicies, m.channelType, m.role)?.read !== 1) continue;

      const depth: DerivedSyncView['depth'] = isSubtreeGrant(m.channelType, m.role) ? 'subtree' : 'self';
      const prefix = m.channelType === 'organization' ? m.organizationId : resolvePath(m.channelType, m.channelId);
      if (!prefix) continue;

      // Merge per (org, entityType, depth): home-level grants become one prefix-set view.
      const key = `${m.organizationId}:${entityType}:${depth}`;
      const existing = views.get(key);
      if (existing) {
        if (!existing.prefixes.includes(prefix)) existing.prefixes.push(prefix);
      } else {
        views.set(key, { key, organizationId: m.organizationId, prefixes: [prefix], entityTypes: [entityType], depth });
      }
    }
  }

  // An org-wide subtree prefix subsumes every narrower prefix of the same view.
  for (const view of views.values()) {
    view.prefixes.sort();
    if (view.depth === 'subtree' && view.prefixes.includes(view.organizationId)) {
      view.prefixes = [view.organizationId];
    }
  }

  return [...views.values()];
}
