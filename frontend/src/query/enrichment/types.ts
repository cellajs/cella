import type { EntityEnrichment } from '~/modules/entities/types';

/** Entity shape in infinite query pages — derived from EntityEnrichment fields */
export type EnrichableEntity = { id: string; slug?: string } & EntityEnrichment;

/** Infinite query data shape */
export interface InfiniteData {
  pages: { items: EnrichableEntity[] }[];
}
