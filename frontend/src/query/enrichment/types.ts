import type { ChannelEnrichment } from '~/modules/entities/types';

/** A cached channel row, in a list page or a detail, as the enrichers read and write it. */
export type EnrichableChannel = { id: string; slug?: string } & ChannelEnrichment;

export interface EnrichableListData {
  pages: { items: EnrichableChannel[] }[];
}
