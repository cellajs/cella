/**
 * Type definitions for CDC enrichment data.
 * These types represent the additional entity/user context
 * included with membership events.
 */

/** User information for enriched membership events */
export interface UserInfo {
  id: string;
  name: string | null;
  email: string;
  thumbnailUrl: string | null;
}

/** Entity information for enriched membership events */
export interface EntityInfo {
  id: string;
  name: string;
  slug: string;
  thumbnailUrl: string | null;
  entityType: string;
}

/** Combined enrichment data for membership events */
export interface EnrichedMembershipData {
  user: UserInfo | null;
  entity: EntityInfo | null;
}
