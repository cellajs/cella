import type { ChannelEntityEnrichment } from '~/modules/entities/types';

/** Entity shape in infinite query pages, derived from ChannelEntityEnrichment fields. */
export type EnrichableChannelEntity = { id: string; slug?: string } & ChannelEntityEnrichment;

/** Infinite query data shape */
export interface InfiniteData {
  pages: { items: EnrichableChannelEntity[] }[];
}
