import type { ChannelEnrichment } from '~/modules/entities/types';

/** Entity shape in infinite query pages, derived from ChannelEnrichment fields. */
export type EnrichableChannel = { id: string; slug?: string } & ChannelEnrichment;

export interface EnrichableListData {
  pages: { items: EnrichableChannel[] }[];
}
