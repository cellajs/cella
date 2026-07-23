import type { ChannelEntityType, ProductEntityType } from '../../types';

/**
 * Per-subject public read opt-in, keyed by entity type. A present key grants actor-independent
 * read access when the row's own `publicAt` is set.
 *
 * Parent-derived publication is a data-propagation concern because SQL and stream dispatch
 * must evaluate row-local data. The shared `public` row condition keeps engine, SQL, and
 * dispatch decisions aligned.
 *
 * @see cella/PERMISSIONS.md
 */
export type PublicReadGrants = Partial<Record<ChannelEntityType | ProductEntityType, true>>;
