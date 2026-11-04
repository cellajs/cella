import type { ChannelBase, UserMinimalBase } from 'sdk';
import type { ChannelEntityType, EntityRole, ProductEntityType } from 'shared';

/** Ancestor channel entity slugs for URL building, populated via cache enrichment. */
export type AncestorSlugs = Partial<Record<ChannelEntityType, string>>;

export type ChannelEnrichment = {
  /** Parent organization id, present on sub-channel entities such as a workspace. */
  organizationId?: string;
  ancestorSlugs?: AncestorSlugs;
};

/** API base + frontend cache enrichment. Use `ChannelBase` from `sdk` for base fields only. */
export type EnrichedChannel = ChannelBase & ChannelEnrichment;

/** The `included.counts` fields a channel tile reads, loose enough for every channel's own count shape. */
type ChannelTileCounts = {
  membership: Partial<Record<EntityRole, number>> & { pending: number; total: number };
  entities?: Partial<Record<ProductEntityType | ChannelEntityType, number>>;
  activity?: Partial<Record<ProductEntityType, { created: number | null }>>;
};

/** A channel row as the `ChannelTile` parts read it: fields beyond the channel base are optional, and each part shows what is there. */
export type ChannelTileEntity = EnrichedChannel & {
  publishedAt?: string | null;
  description?: string | null;
  included?: { counts?: ChannelTileCounts; members?: Pick<UserMinimalBase, 'id' | 'name' | 'thumbnailUrl'>[] };
};
