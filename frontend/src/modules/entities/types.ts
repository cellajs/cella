import type { ChannelBase, MembershipBase, UserMinimalBase } from 'sdk';
import type { ChannelEntityType, EntityCanMap, EntityRole, ProductEntityType } from 'shared';

/** Ancestor channel entity slugs for URL building, populated via cache enrichment. */
export type AncestorSlugs = Partial<Record<ChannelEntityType, string>>;

export type EntityCan = EntityCanMap;

export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: NonNullable<T[P]> };

export type ChannelEnrichment = {
  /** Parent organization id, present on sub-channel entities such as a workspace. */
  organizationId?: string;
  /** Populated by cache enrichment from myMemberships. */
  membership?: MembershipBase | null;
  /** The viewer holds an unanswered invitation to this channel; populated by cache enrichment once the invites list is cached. */
  invited?: boolean;
  ancestorSlugs?: AncestorSlugs;
  /** Populated by cache enrichment from membership and policies. */
  can?: EntityCan;
  /** `can` without the system-admin bypass: what the memberships alone grant, which is all a description editor may answer by, as the relay honours no bypass. */
  memberCan?: EntityCan;
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
