import type { ChannelEntityType, EntityActionType, EntityIdColumns, EntityRole, ProductEntityType } from '../../../types.ts';
import type { PublicReadGrants } from '../public-read.ts';
import type { HierarchyOverrides } from './resolve-hierarchy.ts';

export type ChannelIdColumns = EntityIdColumns<ChannelEntityType, string | null>;

/** Ancestor channel IDs by type. `null` marks an intentionally unused level. */
export type AncestorChannelIds = Partial<Record<ChannelEntityType, string | null>>;

/** Tier models may carry extra fields; these are the ones the engine reads. */
export interface AccessMembership {
  channelType: ChannelEntityType;
  channelId: string;
  role: EntityRole;
}

export type SubjectForPermission = {
  entityType: ChannelEntityType | ProductEntityType;
  id?: string;
  /** Creator ID used by the built-in `own` condition. */
  createdBy?: string | null;
  channelIds: AncestorChannelIds;
  /**
   * Same-row fields read by row conditions and public read grants. Row-local rules let the
   * JavaScript check, the compiled SQL and stream dispatch reach the same decision.
   * @see row-conditions.ts @see public-read.ts
   */
  row?: Record<string, unknown>;
};

export interface PermissionDecision<T extends AccessMembership = AccessMembership> {
  can: Record<EntityActionType, boolean>;
  /** The actor's first membership on the subject's primary channel, null without one. */
  membership: T | null;
}

export interface PermissionCheckOptions extends HierarchyOverrides {
  isSystemAdmin?: boolean;
  /** Acting actor id (a user or a service account). Required by `own` conditions. */
  actorId?: string;
  /** The `checkAccess*` wrappers inject the configured grants. @see public-read.ts */
  publicGrants?: PublicReadGrants;
}
