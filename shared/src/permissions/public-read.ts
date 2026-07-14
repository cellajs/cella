import type { ContextEntityType, ProductEntityType } from '../../types';
import type { RowCondition } from './row-conditions';

/**
 * Public read mode: a subject-level grant that makes rows readable by any actor —
 * including anonymous — independent of memberships.
 *
 * Public readability is a property of the ROW: the row's own `publicAt` is set. There is
 * deliberately no parent-derived mode. A cross-row rule ("public because my parent is
 * public") cannot be evaluated by the paths that must agree on it: the collection-read SQL
 * compiler would need a join, and CDC stream dispatch only ever ships the row itself
 * (`cdc/src/utils/permission-row-data.ts`). Cascading publication is therefore a DATA
 * concern — a fork that wants it propagates `publicAt` to descendants (trigger or app
 * logic) and every path keeps reading one self-describing column.
 *
 * See `cella/PERMISSIONS.md`.
 */
export type PublicReadMode = 'publicSelf';

/** Per-subject public read grants, keyed by entity type. */
export type PublicReadGrants = Partial<Record<ContextEntityType | ProductEntityType, PublicReadMode>>;

/**
 * The row predicate a public read grant evaluates to.
 *
 * Shares the `RowCondition` shape with policy row conditions so that every enforcement path —
 * the engine's check-form, the backend's compiled SQL, and stream dispatch — evaluates it
 * through the one shared interpreter, and the check/SQL parity property test covers it for free.
 *
 * Unlike a policy row condition, this grant is membership-INDEPENDENT: it is not a policy cell,
 * it widens `read` on its own. Hence the actor-independent `columnIsNotNull` predicate —
 * anonymous actors match.
 */
export const publicRow: RowCondition = {
  name: 'public',
  predicate: { kind: 'columnIsNotNull', column: 'publicAt' },
};
