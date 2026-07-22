import type { ChannelBase, MembershipBase } from 'sdk';
import type { ChannelEntityType, EntityCanMap } from 'shared';

/** Ancestor channel entity slugs for URL building, populated via cache enrichment. */
export type AncestorSlugs = Partial<Record<ChannelEntityType, string>>;

/** Entity permission map whose values allow, deny, or conditionally allow the actor's own rows. */
export type EntityCan = EntityCanMap;

/** Makes specified keys required and non-nullable */
export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: NonNullable<T[P]> };

/** Fields added by the frontend cache enrichment pipeline (membership, permissions, ancestor slugs) */
export type ChannelEnrichment = {
  /** Parent organization ID - used by sub-context-entities (e.g. workspace) in forks */
  organizationId?: string;
  /** Membership data - populated via cache enrichment from myMemberships */
  membership?: MembershipBase | null;
  /** Ancestor channel entity slugs for URL building - populated via cache enrichment */
  ancestorSlugs?: AncestorSlugs;
  /** Entity action permissions - populated via cache enrichment from membership + policies */
  can?: EntityCan;
};

/** API base + frontend cache enrichment. Use `ChannelBase` from `sdk` for base fields only. */
export type EnrichedChannel = ChannelBase & ChannelEnrichment;
