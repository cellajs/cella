import type { ContextEntityType, EntityCanMap } from 'shared';
import type { ContextEntityBase, MembershipBase } from '~/api.gen';

/** Ancestor context entity slugs for URL building — populated via cache enrichment */
export type AncestorSlugs = Partial<Record<ContextEntityType, string>>;

/** Entity-type-keyed permission map — computed on the frontend from membership + access policies */
export type EntityCan = EntityCanMap;

/** Makes specified keys required and non-nullable */
export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: NonNullable<T[P]> };

/** Fields added by the frontend cache enrichment pipeline (membership, permissions, ancestor slugs) */
export type EntityEnrichment = {
  /** Parent organization ID - used by sub-context-entities (e.g. workspace) in forks */
  organizationId?: string;
  /** Membership data - populated via cache enrichment from myMemberships */
  membership?: MembershipBase | null;
  /** Ancestor context entity slugs for URL building - populated via cache enrichment */
  ancestorSlugs?: AncestorSlugs;
  /** Entity action permissions - populated via cache enrichment from membership + policies */
  can?: EntityCan;
};

/**
 * Frontend-enriched context entity type.
 * Extends the API base with client-side data populated via cache enrichment.
 * Use `ContextEntityBase` from `~/api.gen` when you only need the base fields.
 */
export type EnrichedContextEntity = ContextEntityBase & EntityEnrichment;
