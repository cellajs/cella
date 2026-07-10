import type { EntityActionType } from '../../../types';

/**
 * The testability seam that lets the permission engine run against a hierarchy other than the
 * app's real `shared/config` — kept out of `types.ts` to keep that core module focused.
 *
 * Both are optional overrides: with no `topology` the engine reads the `hierarchy`/`appConfig`
 * singletons exactly as before. Tests pass a synthetic hierarchy (see
 * `shared/src/testing/wide-fixture.ts`) to exercise deeper shapes — nested contexts, guest
 * roles — than a given fork's config ships, without module-mocking `shared`.
 */

/** Structural subset of the app's `EntityHierarchy` the engine reads; the real `hierarchy` satisfies it. */
export interface TopologyHierarchy {
  readonly contextTypes: readonly string[];
  getOrderedAncestors(entityType: string): readonly string[];
  getOrderedDescendants(entityType: string): readonly string[];
  getRoles(contextType: string): readonly string[];
  isContext(entityType: string): boolean;
  isProduct(entityType: string): boolean;
  getParent(entityType: string): string | null;
}

export interface PermissionTopology {
  hierarchy: TopologyHierarchy;
  /** Defaults to `appConfig.entityActions` (the action set is hierarchy-independent). */
  entityActions?: readonly EntityActionType[];
}
