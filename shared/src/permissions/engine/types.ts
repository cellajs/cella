import type {
  ChannelEntityType,
  EntityActionType,
  EntityIdColumns,
  EntityRole,
  ProductEntityType,
} from '../../../types.ts';
import type { EntityHierarchy } from '../../config-builder/entity-hierarchy.ts';
import type { PublicReadGrants } from '../public-read.ts';

export type ChannelIdColumns = EntityIdColumns<ChannelEntityType, string | null>;

/** Ancestor channel IDs by type. `null` marks an intentionally unused level. */
export type AncestorChannelIds = Partial<Record<ChannelEntityType, string | null>>;

export type ResolvedChannelIds = Partial<Record<ChannelEntityType, string>>;

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

export interface PermissionCheckOptions {
  isSystemAdmin?: boolean;
  /** Acting user ID. Required by `own` conditions. */
  userId?: string;
  /** The `checkAccess*` wrappers inject the configured grants. @see public-read.ts */
  publicGrants?: PublicReadGrants;
  /**
   * `${channelType}:${role}` keys of subtree-wide grants, compiled from the hierarchy's
   * per-channel `elevated` declarations (`hierarchy.elevatedGrants`). An empty set makes every
   * product grant home-scoped; `undefined` disables the elevation concept entirely (every grant
   * subtree-wide) for callers driving the engine with synthetic policies.
   */
  elevatedGrants?: ReadonlySet<string>;
  /** Synthetic hierarchy override; defaults to the app singleton. */
  hierarchy?: EntityHierarchy;
  /** Action set override; defaults to `appConfig.entityActions`. */
  entityActions?: readonly EntityActionType[];
  /** Emit the decision tree to debug logging. */
  debug?: boolean;
}
