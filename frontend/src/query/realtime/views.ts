import {
  type AccessPolicies,
  type AncestorSource,
  accessPolicies,
  elevatedRoles as configuredElevatedRoles,
  getPolicyPermissions,
  getSubjectPolicies,
  hierarchy,
} from 'shared';

/** Grant-boundary view shape (cursor is owned by the sync store, not the derivation). */
export interface DerivedSyncView {
  key: string;
  organizationId: string;
  prefixes: string[];
  entityTypes: string[];
  depth: 'self' | 'subtree';
}

/** The membership fields the derivation reads (client cache shape). */
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
  /** Injectable for synthetic-topology tests; default to the app's real config. */
  policies?: AccessPolicies;
  topology?: AncestorSource;
  elevatedRoles?: readonly string[];
}

/**
 * Derive the view set from the caller's grant shapes. Views belong at grant
 * boundaries, where `resolveViewReadStatus` can prove them `ok`:
 *
 * - org-level unconditional read, subtree-scoped (elevated role, or no elevatedRoles
 *   configured, or the org IS the home level) → ONE org subtree view per entity type
 * - home-level grants (deepest level, e.g. project members) → one subtree view whose
 *   prefix SET is all granted nodes (the "3-of-5 projects" aggregate)
 * - elevated intermediate grants (staff at course/section) → subtree view per node
 * - home-scoped grants (non-elevated above home, incl. org-level) → SELF view per node
 *   (the channel's own wall: exactly the rows the grant covers)
 *
 * Conditional grants (`read:'own'`, public) derive nothing: unprovable summaries; those
 * rows keep riding org-view fetches + staleness. Unknown channel paths skip their grant
 * (the org view remains the fallback). Pure; callers wire results via `declareSyncView`.
 */
export function deriveGrantBoundaryViews({
  memberships,
  entityTypes,
  resolvePath,
  policies = accessPolicies,
  topology = hierarchy,
  elevatedRoles = configuredElevatedRoles,
}: DeriveViewsInput): DerivedSyncView[] {
  const views = new Map<string, DerivedSyncView>();

  for (const entityType of entityTypes) {
    const subjectPolicies = getSubjectPolicies(entityType as never, policies);
    // Ancestors are most-specific → root; the home level is the first non-root one.
    const ancestors = topology.getOrderedAncestors(entityType);
    const root = ancestors[ancestors.length - 1];
    const homeLevel = ancestors.find((a) => a !== root) ?? root;
    // Mirrors the engine's isHomeScopedGrant: without elevatedRoles every grant is subtree.
    const isSubtreeGrant = (channelType: string, role: string) =>
      channelType === homeLevel || elevatedRoles === undefined || elevatedRoles.includes(role);

    for (const m of memberships) {
      if (!ancestors.includes(m.channelType)) continue;
      if (getPolicyPermissions(subjectPolicies, m.channelType as never, m.role as never)?.read !== 1) continue;

      const depth: DerivedSyncView['depth'] = isSubtreeGrant(m.channelType, m.role) ? 'subtree' : 'self';
      const prefix = m.channelType === root ? m.organizationId : resolvePath(m.channelType, m.channelId);
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
