import type { ChannelEntityType, ProductEntityType } from '../../types';

/**
 * Public read mode: a subject-level grant that makes rows readable by any actor.
 * Including anonymous: independent of memberships.
 *
 * Public readability is a property of the ROW: the row's own `publicAt` is set. There is
 * deliberately no parent-derived mode. A cross-row rule ("public because my parent is
 * public") cannot be evaluated by the paths that must agree on it: the collection-read SQL
 * compiler would need a join, and CDC stream dispatch only ever ships the row itself
 * (`cdc/src/utils/permission-row-data.ts`). Cascading publication is therefore a DATA
 * concern: a fork that wants it propagates `publicAt` to descendants (trigger or app
 * logic) and every path keeps reading one self-describing column.
 *
 * A public read grant resolves through the `'public'` row condition (`row-conditions.ts`), so it
 * rides the exact same name-keyed switches as policy row conditions. The engine's check-form, the
 * backend's compiled SQL, and stream dispatch all agree, and the parity property test covers it for
 * free. Unlike a policy row condition it is membership-INDEPENDENT: it is not a policy cell, it
 * widens `read` on its own, which is why `'public'` is actor-independent (anonymous actors match).
 *
 * @see cella/PERMISSIONS.md
 */
export type PublicReadMode = 'publicSelf';

/** Per-subject public read grants, keyed by entity type. */
export type PublicReadGrants = Partial<Record<ChannelEntityType | ProductEntityType, PublicReadMode>>;
