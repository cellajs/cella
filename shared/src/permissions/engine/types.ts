import type { ChannelEntityType, EntityActionType, EntityIdColumns, EntityRole, ProductEntityType } from '../../../types';
import type { PublicReadGrants } from '../public-read';
import type { EntityHierarchy } from '../../config-builder/entity-hierarchy';

/** Database-shaped channel ID columns, such as `organizationId`. */
export type ChannelIdColumns = EntityIdColumns<ChannelEntityType, string | null>;

/** Ancestor channel IDs by type. `null` marks an intentionally unused level. */
export type AncestorChannelIds = Partial<Record<ChannelEntityType, string | null>>;

/** Channel IDs resolved during permission evaluation. */
export type ResolvedChannelIds = Partial<Record<ChannelEntityType, string>>;

/** Membership fields read by the permission engine. Tier models may include extra fields. */
export interface AccessMembership {
  channelType: ChannelEntityType;
  channelId: string;
  role: EntityRole;
}

/** Entity evaluated by the permission engine. */
export type SubjectForPermission = {
  entityType: ChannelEntityType | ProductEntityType;
  id?: string;
  /** Creator ID used by the built-in `own` condition. */
  createdBy?: string | null;
  channelIds: AncestorChannelIds;
  /**
   * Same-row fields used by row conditions and public read grants. Keeping rules row-local
   * lets JavaScript checks, compiled SQL, and stream dispatch produce the same decision.
   *
   * @see row-conditions.ts
   * @see public-read.ts
   */
  row?: Record<string, unknown>;
};

/** Source that granted an action. */
export type GrantSource =
  | { type: 'membership'; channelType: ChannelEntityType; channelId: string; role: EntityRole }
  | { type: 'relation'; relation: string }
  | { type: 'public' }
  | { type: 'systemAdmin' };

export interface ActionAttribution {
  allowed: boolean;
  grantedBy: GrantSource[];
}

export interface PermissionDecision<T extends AccessMembership = AccessMembership> {
  subject: {
    entityType: ChannelEntityType | ProductEntityType;
    id?: string;
    channelIds: ResolvedChannelIds;
  };
  actions: Record<EntityActionType, ActionAttribution>;
  can: Record<EntityActionType, boolean>;
  membership: T | null;
}

/** Optional controls for permission evaluation. */
export interface PermissionCheckOptions {
  isSystemAdmin?: boolean;
  /** Acting user ID. Required by `own` conditions. */
  userId?: string;
  /**
   * Public read grants. The `checkAccess*` wrappers inject configured grants; direct callers
   * only pass these for synthetic policies.
   *
   * @see public-read.ts
   */
  publicGrants?: PublicReadGrants;
  /**
   * Roles with subtree-wide grants for product subjects. Other roles grant only at a row's
   * home channel. `undefined` treats every role as subtree-wide.
   *
   * @see shared/config/permissions-config.ts
   */
  elevatedRoles?: readonly string[];
  /** Synthetic hierarchy override; defaults to the app singleton. */
  hierarchy?: EntityHierarchy;
  /** Action set override; defaults to `appConfig.entityActions`. */
  entityActions?: readonly EntityActionType[];
  /** Emit the decision tree to debug logging. */
  debug?: boolean;
}
