import type { ContextEntityBase, MembershipBase } from '~/api.gen';

/** Standard CRUD+search permissions object returned by entity detail endpoints */
// TODO clean this up when we refactored permission manager and move it to shared to directly
// use it here in frontend
export type EntityCan = {
  create: boolean;
  read: boolean;
  update: boolean;
  delete: boolean;
  search: boolean;
};

/**
 * Frontend-enriched context entity type.
 * Extends the API base with client-side data (membership from cache, can from detail responses).
 * Use `ContextEntityBase` from `~/api.gen` when you only need the base fields.
 */
export type ContextEntity = ContextEntityBase & {
  organizationId?: string;
  /** Membership data - populated via cache enrichment from myMemberships */
  membership?: MembershipBase | null;
  /** Entity action permissions from detail response */
  can?: EntityCan;
};
