import type { ChannelBase, MembershipBase } from 'sdk';
import type { ChannelEntityType, EntityCanMap } from 'shared';

/** Ancestor channel entity slugs for URL building, populated via cache enrichment. */
export type AncestorSlugs = Partial<Record<ChannelEntityType, string>>;

export type EntityCan = EntityCanMap;

export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: NonNullable<T[P]> };

export type ChannelEnrichment = {
  /** Parent organization id, present on sub-channel entities such as a workspace. */
  organizationId?: string;
  /** Populated by cache enrichment from myMemberships. */
  membership?: MembershipBase | null;
  ancestorSlugs?: AncestorSlugs;
  /** Populated by cache enrichment from membership and policies. */
  can?: EntityCan;
};

/** API base + frontend cache enrichment. Use `ChannelBase` from `sdk` for base fields only. */
export type EnrichedChannel = ChannelBase & ChannelEnrichment;
