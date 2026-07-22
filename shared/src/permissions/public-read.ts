import type { ChannelEntityType, ProductEntityType } from '../../types';

/**
 * Grants actor-independent read access when the row's own `publicAt` is set.
 * Parent-derived publication is a data-propagation concern because SQL and stream dispatch
 * must evaluate row-local data. The shared `public` row condition keeps engine, SQL, and
 * dispatch decisions aligned.
 * @see cella/PERMISSIONS.md
 */
export type PublicReadMode = 'publicSelf';

/** Per-subject public read grants, keyed by entity type. */
export type PublicReadGrants = Partial<Record<ChannelEntityType | ProductEntityType, PublicReadMode>>;
