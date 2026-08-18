import type { ChannelEntityType, ProductEntityType } from '../../types.ts';

/**
 * Public read opt-in keyed by entity type. A present key grants actor-independent read access
 * when the row's own `publicAt` is set. Publication derived from a parent is propagated as data,
 * because SQL and stream dispatch evaluate row-local fields only. @see cella/PERMISSIONS.md
 */
export type PublicReadGrants = Partial<Record<ChannelEntityType | ProductEntityType, true>>;
